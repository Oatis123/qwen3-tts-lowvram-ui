import logging
import queue
import threading

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from . import audio
from .engine import Engine, Request

log = logging.getLogger("qts.compat")


class Player:
    def __init__(self, device=None):
        self.device = device
        self.q: queue.Queue = queue.Queue()
        self.buffer = np.zeros(0, dtype=np.float32)
        self.lock = threading.Lock()
        self.stream = None
        self.sr = audio.SR

    def _callback(self, outdata, frames, _time, _status):
        with self.lock:
            while not self.q.empty():
                self.buffer = np.append(self.buffer, self.q.get_nowait())
            n = min(frames, len(self.buffer))
            outdata[:n, 0] = self.buffer[:n]
            outdata[n:].fill(0)
            self.buffer = self.buffer[n:]

    def push(self, chunk: np.ndarray, sr: int) -> None:
        if self.stream is None:
            import sounddevice as sd

            self.sr = sr
            self.stream = sd.OutputStream(samplerate=sr, channels=1, dtype="float32", callback=self._callback, device=self.device)
            self.stream.start()
        self.q.put(chunk.astype(np.float32, copy=False))

    def clear(self) -> None:
        with self.lock:
            while not self.q.empty():
                self.q.get_nowait()
            fade = min(int(0.05 * self.sr), len(self.buffer))
            if fade:
                self.buffer = self.buffer[:fade] * np.linspace(1.0, 0.0, fade, dtype=np.float32)

    def is_playing(self) -> bool:
        with self.lock:
            return not self.q.empty() or len(self.buffer) > 0

    def close(self) -> None:
        if self.stream is not None:
            self.stream.stop()
            self.stream.close()
            self.stream = None


class TTSRequest(BaseModel):
    text: str


class CompatServer:
    def __init__(self, engine: Engine):
        self.engine = engine
        self.preset: dict = {}
        self.server = None
        self.thread: threading.Thread | None = None
        self.port: int | None = None
        self.host: str | None = None
        self.player = Player()
        self.lines: queue.Queue = queue.Queue()
        self.interrupt = threading.Event()
        threading.Thread(target=self._worker, daemon=True).start()

    def _request(self, text: str) -> Request:
        from .server import build_request

        return build_request({**self.preset, "text": text, "save": False})

    def _generate(self, text: str, stop: threading.Event, on_audio):
        return self.engine.run(self._request(text), stop, on_audio, lambda _e: None)

    def _worker(self):
        while True:
            text = self.lines.get()
            try:
                if not self.interrupt.is_set():
                    self._generate(text, self.interrupt, lambda a: self.player.push(a, audio.SR))
            except Exception as e:
                log.error("play failed: %s", e)

    def app(self) -> FastAPI:
        api = FastAPI(title="Qwen TTS Studio API")

        @api.get("/ping")
        def ping():
            return {"ok": True}

        @api.get("/is_playing")
        def is_playing():
            return {"is_playing": not self.lines.empty() or self.player.is_playing()}

        @api.post("/play")
        def play(body: TTSRequest):
            self.interrupt.clear()
            self.lines.put(body.text)
            return {"status": "enqueued", "queue_size": self.lines.qsize()}

        @api.post("/stop")
        def stop():
            self.interrupt.set()
            while not self.lines.empty():
                self.lines.get_nowait()
            self.player.clear()
            return {"status": "stopped"}

        @api.post("/synthesize")
        def synthesize(body: TTSRequest):
            try:
                out = self._generate(body.text, threading.Event(), lambda _a: None)
            except Exception as e:
                raise HTTPException(500, str(e))
            if not out:
                raise HTTPException(500, "Model returned no audio")
            return Response(audio.wav_bytes(out["audio"], out["sr"]), media_type="audio/wav")

        @api.post("/synthesize_stream")
        def synthesize_stream(body: TTSRequest):
            q: queue.Queue = queue.Queue()
            stop = threading.Event()

            def run():
                try:
                    self._generate(body.text, stop, lambda a: q.put(a))
                except Exception as e:
                    log.error("stream failed: %s", e)
                finally:
                    q.put(None)

            threading.Thread(target=run, daemon=True).start()

            def chunks():
                try:
                    while (a := q.get()) is not None:
                        yield (np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes()
                finally:
                    stop.set()

            return StreamingResponse(chunks(), media_type="application/octet-stream",
                                     headers={"X-Audio-Format": "s16le", "X-Sample-Rate": str(audio.SR), "X-Channels": "1"})

        return api

    def configure(self, enabled: bool, host: str, port: int, preset: dict) -> dict:
        self.preset = preset
        if not enabled or (self.server and (host, port) != (self.host, self.port)):
            self.stop_server()
        if enabled and self.server is None:
            import uvicorn

            config = uvicorn.Config(self.app(), host=host, port=port, log_level="warning")
            self.server = uvicorn.Server(config)
            self.host, self.port = host, port
            self.thread = threading.Thread(target=self.server.run, daemon=True)
            self.thread.start()
        return self.status()

    def stop_server(self) -> None:
        if self.server:
            self.server.should_exit = True
            if self.thread:
                self.thread.join(timeout=5)
        self.server = None
        self.thread = None

    def status(self) -> dict:
        running = bool(self.server and self.thread and self.thread.is_alive())
        return {"running": running, "host": self.host, "port": self.port}
