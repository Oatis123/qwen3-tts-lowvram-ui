import asyncio
import json
from contextlib import asynccontextmanager
import logging
import threading
from dataclasses import fields
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request as HttpRequest, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from . import audio
from .asr import Asr
from .compat import CompatServer
from .engine import Busy, Engine, LoadOptions, ModelMissing, Params, Request
from .store import History, NotFound, Voices

log = logging.getLogger("qts.server")


def _pick(cls, data: dict | None):
    names = {f.name for f in fields(cls)}
    return cls(**{k: v for k, v in (data or {}).items() if k in names})


def build_request(data: dict) -> Request:
    return Request(
        mode=data.get("mode", "clone"),
        size=data.get("size", "0.6B"),
        text=data.get("text", ""),
        language=data.get("language") or "Auto",
        voice_id=data.get("voice_id"),
        speaker=data.get("speaker"),
        instruct=data.get("instruct"),
        params=_pick(Params, data.get("params")),
        load=_pick(LoadOptions, data.get("load")),
        save=data.get("save", True),
    )


class LoadBody(BaseModel):
    model_id: str
    load: dict | None = None


class VoicePatch(BaseModel):
    name: str | None = None
    text: str | None = None
    language: str | None = None
    favorite: bool | None = None


class PathBody(BaseModel):
    path: str
    format: str = "wav"


class FromHistoryBody(BaseModel):
    history_id: str
    name: str


class CompatBody(BaseModel):
    enabled: bool
    host: str = "127.0.0.1"
    port: int = 2027
    preset: dict = {}


def create_app(data_dir: Path, models_dir: Path, catalog: dict, token: str, on_ready=None) -> FastAPI:
    voices = Voices(data_dir)
    history = History(data_dir)
    engine = Engine(models_dir, catalog, voices, history)
    asr = Asr()
    compat = CompatServer(engine)
    whisper = {m["id"]: m for m in catalog["whisper"]}

    @asynccontextmanager
    async def lifespan(_app):
        if on_ready:
            on_ready()
        yield
        compat.stop_server()

    app = FastAPI(lifespan=lifespan)

    @app.middleware("http")
    async def auth(request: HttpRequest, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        if request.headers.get("x-token") != token and request.query_params.get("token") != token:
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
        return await call_next(request)

    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(NotFound)
    async def not_found(_r, e):
        return JSONResponse({"detail": f"not found: {e}", "code": "not_found"}, status_code=404)

    @app.exception_handler(ModelMissing)
    async def missing(_r, e):
        return JSONResponse({"detail": str(e), "code": "model_missing"}, status_code=409)

    @app.exception_handler(Busy)
    async def busy(_r, _e):
        return JSONResponse({"detail": "busy", "code": "busy"}, status_code=409)

    @app.get("/ping")
    def ping():
        return {"ok": True}

    @app.get("/status")
    def status():
        return {"model": engine.status(), "asr": asr.active, "compat": compat.status()}

    @app.get("/stats")
    def stats():
        return engine.stats()

    @app.post("/model/load")
    async def model_load(body: LoadBody):
        opts = _pick(LoadOptions, body.load)
        try:
            await asyncio.to_thread(engine.load, body.model_id, opts)
        except (ModelMissing, Busy):
            raise
        except Exception as e:
            raise HTTPException(500, _humanize(e))
        return engine.status()

    @app.post("/model/unload")
    async def model_unload():
        await asyncio.to_thread(engine.unload)
        return engine.status()

    @app.post("/asr/transcribe")
    async def transcribe(
        file: UploadFile = File(...),
        model: str = Form("large-v3-turbo"),
        language: str = Form(""),
        device: str = Form("cuda"),
        compute_type: str = Form("int8_float16"),
        beam_size: int = Form(5),
        vad: bool = Form(True),
    ):
        entry = whisper.get(model)
        if entry is None:
            raise HTTPException(400, f"unknown whisper model {model}")
        model_dir = models_dir / entry["repo"].replace("/", "--")
        if not (model_dir / "model.bin").exists():
            raise ModelMissing(f"whisper-{model}")
        x, sr = audio.read(await file.read())

        def run():
            asr.active = model
            try:
                return asr.transcribe(x, sr, model_dir, language if language not in ("", "Auto") else None, device, compute_type, beam_size, vad)
            finally:
                asr.active = None

        try:
            return await asyncio.to_thread(run)
        except Exception as e:
            raise HTTPException(500, _humanize(e))

    @app.get("/voices")
    def voices_list():
        return voices.list()

    @app.post("/voices")
    async def voices_create(
        file: UploadFile = File(...),
        name: str = Form(...),
        text: str = Form(...),
        language: str = Form("Auto"),
        source: str = Form("file"),
    ):
        x, sr = audio.read(await file.read())
        if len(x) < sr * 1.5:
            raise HTTPException(400, "Запись слишком короткая, нужно хотя бы 3 секунды")
        if not text.strip():
            raise HTTPException(400, "Нужна расшифровка записи")
        return voices.create(audio.normalize(x), sr, name, text, language, source)

    @app.patch("/voices/{voice_id}")
    def voices_patch(voice_id: str, body: VoicePatch):
        return voices.update(voice_id, body.model_dump(exclude_none=True))

    @app.delete("/voices/{voice_id}")
    def voices_delete(voice_id: str):
        voices.delete(voice_id)
        return {"ok": True}

    @app.get("/voices/{voice_id}/audio")
    def voices_audio(voice_id: str):
        return FileResponse(voices.audio_path(voice_id), media_type="audio/wav")

    @app.post("/voices/{voice_id}/export")
    def voices_export(voice_id: str, body: PathBody):
        voices.export(voice_id, body.path)
        return {"ok": True}

    @app.post("/voices/import")
    def voices_import(body: PathBody):
        try:
            return voices.import_(body.path)
        except (KeyError, ValueError, OSError) as e:
            raise HTTPException(400, f"Не удалось открыть файл голоса: {e}")

    @app.post("/voices/from-history")
    def voices_from_history(body: FromHistoryBody):
        item = history.get(body.history_id)
        x, sr = audio.read(history.audio_path(body.history_id))
        x = audio.trim_silence(x, sr)
        if len(x) > sr * 30:
            raise HTTPException(400, "Фрагмент длиннее 30 секунд, для голоса нужен короткий образец")
        return voices.create(audio.normalize(x), sr, body.name, item["text"], item.get("language", "Auto"), "design")

    @app.get("/history")
    def history_list(offset: int = 0, limit: int = 100, q: str = ""):
        return history.list(offset, limit, q)

    @app.get("/history/{item_id}/audio")
    def history_audio(item_id: str):
        return FileResponse(history.audio_path(item_id), media_type="audio/wav")

    @app.delete("/history/{item_id}")
    def history_delete(item_id: str):
        history.delete(item_id)
        return {"ok": True}

    @app.delete("/history")
    def history_clear():
        history.clear()
        return {"ok": True}

    @app.post("/history/{item_id}/export")
    def history_export(item_id: str, body: PathBody):
        if body.format not in audio.FORMATS:
            raise HTTPException(400, "unsupported format")
        x, sr = audio.read(history.audio_path(item_id), target_sr=None)
        audio.write(body.path, x, sr, body.format)
        return {"ok": True}

    @app.post("/compat")
    def compat_config(body: CompatBody):
        try:
            return compat.configure(body.enabled, body.host, body.port, body.preset)
        except Exception as e:
            raise HTTPException(500, str(e))

    @app.websocket("/ws/generate")
    async def ws_generate(ws: WebSocket):
        if ws.query_params.get("token") != token:
            await ws.close(code=4401)
            return
        await ws.accept()
        loop = asyncio.get_running_loop()
        out: asyncio.Queue = asyncio.Queue()
        stop = threading.Event()

        try:
            first = await ws.receive_json()
        except WebSocketDisconnect:
            return
        req = build_request(first)

        def on_audio(a: np.ndarray):
            loop.call_soon_threadsafe(out.put_nowait, a.astype(np.float32).tobytes())

        def on_event(e: dict):
            loop.call_soon_threadsafe(out.put_nowait, e)

        def work():
            try:
                engine.run(req, stop, on_audio, on_event)
            except ModelMissing as e:
                on_event({"type": "error", "code": "model_missing", "message": str(e)})
            except Exception as e:
                log.exception("generation failed")
                on_event({"type": "error", "code": "error", "message": _humanize(e)})
            finally:
                loop.call_soon_threadsafe(out.put_nowait, None)

        async def reader():
            try:
                while True:
                    msg = await ws.receive_json()
                    if msg.get("type") == "stop":
                        stop.set()
            except (WebSocketDisconnect, RuntimeError, json.JSONDecodeError):
                stop.set()

        reader_task = asyncio.create_task(reader())
        worker = asyncio.create_task(asyncio.to_thread(work))
        try:
            while (item := await out.get()) is not None:
                if isinstance(item, bytes):
                    await ws.send_bytes(item)
                else:
                    await ws.send_json(item)
        except (WebSocketDisconnect, RuntimeError):
            stop.set()
        finally:
            await worker
            reader_task.cancel()
            try:
                await ws.close()
            except RuntimeError:
                pass

    return app


def _humanize(e: Exception) -> str:
    msg = str(e)
    if "out of memory" in msg.lower() or e.__class__.__name__ == "OutOfMemoryError":
        return "Не хватает видеопамяти. Выберите модель 0.6B, закройте другие программы, использующие видеокарту, или поднимите лимит VRAM в режиме разработчика."
    if "cublas" in msg.lower() or "cudnn" in msg.lower():
        return f"Ошибка библиотек CUDA: {msg}"
    return msg
