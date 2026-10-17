import gc
import logging
import random
import threading
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Callable

import numpy as np
import torch

from . import audio
from .store import History, Voices
from .textsplit import split_text

log = logging.getLogger("qts.engine")


class ModelMissing(Exception):
    pass


class Busy(Exception):
    pass


@dataclass(frozen=True)
class LoadOptions:
    max_seq_len: int = 2048
    offload_embedding: bool = True
    repack: bool = True
    attn: str = "sdpa"


@dataclass
class Params:
    temperature: float = 0.9
    top_k: int = 50
    top_p: float = 1.0
    do_sample: bool = True
    repetition_penalty: float = 1.05
    max_new_tokens: int = 2048
    min_new_tokens: int = 2
    chunk_size: int = 8
    non_streaming_mode: bool | None = None
    append_silence: bool = True
    xvec_only: bool = False
    seed: int | None = None
    split: bool = True
    split_chars: int = 500
    decode_context: int = 25
    vram_cap_gb: float | None = None


@dataclass
class Request:
    mode: str
    size: str
    text: str
    language: str = "Auto"
    voice_id: str | None = None
    speaker: str | None = None
    instruct: str | None = None
    params: Params = field(default_factory=Params)
    load: LoadOptions = field(default_factory=LoadOptions)
    save: bool = True


def _map_tensors(obj, fn):
    if isinstance(obj, torch.Tensor):
        return fn(obj)
    if isinstance(obj, dict):
        return {k: _map_tensors(v, fn) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return type(obj)(_map_tensors(v, fn) for v in obj)
    return obj


class Engine:
    def __init__(self, models_dir: Path, catalog: dict, voices: Voices, history: History):
        self.models_dir = models_dir
        self.catalog = {m["id"]: m for m in catalog["tts"]}
        self.voices = voices
        self.history = history
        self.lock = threading.Lock()
        self.model = None
        self.model_id: str | None = None
        self.pending_id: str | None = None
        self.load_opts: LoadOptions | None = None
        self.state = "idle"
        self.error: str | None = None
        self.busy = False
        self._prompts: dict[tuple, dict] = {}
        self._cap_applied: float | None = -1

    def model_dir(self, model_id: str) -> Path:
        entry = self.catalog.get(model_id)
        if entry is None:
            raise ModelMissing(model_id)
        return self.models_dir / entry["repo"].replace("/", "--")

    def status(self) -> dict:
        return {
            "state": self.state,
            "model_id": self.model_id or (self.pending_id if self.state in ("loading", "error") else None),
            "error": self.error,
            "busy": self.busy,
            "load": asdict(self.load_opts) if self.load_opts else None,
        }

    def stats(self) -> dict:
        if not torch.cuda.is_available():
            return {"cuda": False}
        free, total = torch.cuda.mem_get_info()
        return {
            "cuda": True,
            "gpu": torch.cuda.get_device_name(0),
            "vram_used": total - free,
            "vram_total": total,
            "torch_allocated": torch.cuda.memory_allocated(),
            "torch_reserved": torch.cuda.memory_reserved(),
            "torch_peak": torch.cuda.max_memory_reserved(),
        }

    def _unload(self) -> None:
        if self.model is None:
            return
        self.model = None
        self.model_id = None
        self.load_opts = None
        self._prompts.clear()
        gc.collect()
        torch.cuda.empty_cache()
        self.state = "idle"

    def unload(self) -> None:
        with self.lock:
            self._unload()
            self.state = "idle"
            self.pending_id = None
            self.error = None

    def _ensure(self, model_id: str, opts: LoadOptions) -> None:
        if self.model is not None and self.model_id == model_id and self.load_opts == opts:
            return
        path = self.model_dir(model_id)
        if not (path / "config.json").exists():
            raise ModelMissing(model_id)
        self._unload()
        self.pending_id = model_id
        self.state = "loading"
        self.error = None
        failure: str | None = None
        try:
            from faster_qwen3_tts import FasterQwen3TTS
            from qwen3_tts_lowvram import offload_text_embedding, repack_weights

            torch.cuda.set_per_process_memory_fraction(1.0)
            self._cap_applied = None
            t0 = time.perf_counter()
            model = FasterQwen3TTS.from_pretrained(str(path), max_seq_len=opts.max_seq_len, attn_implementation=opts.attn)
            if opts.offload_embedding:
                offload_text_embedding(model)
            if opts.repack:
                repack_weights(model)
            model.warmup()
            torch.cuda.empty_cache()
            self.model, self.model_id, self.load_opts = model, model_id, opts
            self.state = "ready"
            log.info("loaded %s in %.1fs", model_id, time.perf_counter() - t0)
        except Exception as e:
            log.exception("load failed")
            failure = f"{e.__class__.__name__}: {e}" if "memory" in str(e).lower() else str(e)
            model = None
        if failure is not None:
            self.state = "error"
            self.error = failure
            self.model = None
            gc.collect()
            torch.cuda.empty_cache()
            raise RuntimeError(failure)

    def load(self, model_id: str, opts: LoadOptions) -> None:
        if not self.lock.acquire(timeout=0.1):
            raise Busy()
        try:
            self._ensure(model_id, opts)
        finally:
            self.lock.release()

    def _apply_runtime(self, p: Params) -> None:
        from qwen3_tts_lowvram import set_vram_cap, trim_decode_context

        trim_decode_context(self.model, p.decode_context if p.decode_context > 0 else 1_000_000)
        cap = p.vram_cap_gb or None
        if cap != self._cap_applied:
            if cap:
                set_vram_cap(cap)
            else:
                torch.cuda.set_per_process_memory_fraction(1.0)
            self._cap_applied = cap

    def _voice_prompt(self, voice: dict, size: str, p: Params) -> dict:
        key = (voice["id"], size, p.xvec_only, p.append_silence, voice["text"])
        if key in self._prompts:
            return self._prompts[key]
        device = self.model.device
        path = self.voices.prompt_path(voice["id"], size, p.xvec_only, p.append_silence)
        vcp = None
        if path.exists():
            try:
                vcp = _map_tensors(torch.load(path, map_location="cpu", weights_only=True), lambda t: t.to(device))
            except Exception:
                log.warning("bad prompt cache %s, rebuilding", path)
        if vcp is None:
            x, sr = audio.read(self.voices.audio_path(voice["id"]), target_sr=None)
            base = self.model.model
            if p.xvec_only:
                items = base.create_voice_clone_prompt(ref_audio=(x, sr), ref_text="", x_vector_only_mode=True)
                vcp = dict(ref_code=[None], ref_spk_embedding=[items[0].ref_spk_embedding], x_vector_only_mode=[True], icl_mode=[False])
            else:
                if p.append_silence:
                    x = np.concatenate([x, np.zeros(int(0.5 * sr), dtype=np.float32)])
                items = base.create_voice_clone_prompt(ref_audio=(x, sr), ref_text=voice["text"])
                vcp = base._prompt_items_to_voice_clone_prompt(items)
            torch.save(_map_tensors(vcp, lambda t: t.detach().cpu()), path)
        self._prompts[key] = vcp
        return vcp

    def _stream(self, req: Request, text: str, voice: dict | None):
        p = req.params
        common = dict(
            text=text,
            language=req.language or "Auto",
            max_new_tokens=p.max_new_tokens,
            min_new_tokens=p.min_new_tokens,
            temperature=p.temperature,
            top_k=p.top_k,
            top_p=p.top_p,
            do_sample=p.do_sample,
            repetition_penalty=p.repetition_penalty,
            chunk_size=p.chunk_size,
            non_streaming_mode=p.non_streaming_mode,
        )
        instruct = (req.instruct or "").strip() or None
        if req.mode == "clone":
            vcp = self._voice_prompt(voice, req.size, p)
            return self.model.generate_voice_clone_streaming(
                ref_text=voice["text"], voice_clone_prompt=vcp, instruct=instruct, **common
            )
        if req.mode == "custom":
            return self.model.generate_custom_voice_streaming(speaker=req.speaker, instruct=instruct, **common)
        if req.mode == "design":
            if not instruct:
                raise ValueError("Опишите голос, который нужно создать")
            return self.model.generate_voice_design_streaming(instruct=instruct, **common)
        raise ValueError(f"unknown mode {req.mode}")

    def run(
        self,
        req: Request,
        stop: threading.Event,
        on_audio: Callable[[np.ndarray], None],
        on_event: Callable[[dict], None],
    ) -> dict | None:
        if not req.text.strip():
            raise ValueError("Введите текст")
        voice = None
        if req.mode == "clone":
            if not req.voice_id:
                raise ValueError("Выберите голос")
            voice = self.voices.get(req.voice_id)
            if not voice.get("text"):
                raise ValueError("У голоса нет расшифровки референса")
        if req.mode == "custom" and not req.speaker:
            raise ValueError("Выберите голос")

        model_id = f"{req.mode}-{req.size}"
        with self.lock:
            self.busy = True
            try:
                if self.model_id != model_id or self.load_opts != req.load or self.model is None:
                    on_event({"type": "loading", "model_id": model_id})
                    self._ensure(model_id, req.load)
                return self._generate(req, voice, stop, on_audio, on_event)
            finally:
                self.busy = False
                torch.cuda.empty_cache()

    def _generate(self, req, voice, stop, on_audio, on_event) -> dict | None:
        p = req.params
        self._apply_runtime(p)
        seed = p.seed if p.seed is not None else random.randint(0, 2**31 - 1)
        torch.manual_seed(seed)
        chunks = split_text(req.text, p.split_chars) if p.split else [(req.text.strip(), 0.0)]
        sr = audio.SR
        on_event({"type": "start", "sr": sr, "segments": len(chunks), "seed": seed, "model_id": self.model_id})
        torch.cuda.reset_peak_memory_stats()
        parts: list[np.ndarray] = []
        t0 = time.perf_counter()
        first_ms = None
        stopped = False
        for i, (text, pause) in enumerate(chunks):
            on_event({"type": "segment", "index": i, "text": text})
            for chunk, chunk_sr, _ in self._stream(req, text, voice):
                if stop.is_set():
                    stopped = True
                    break
                a = np.asarray(chunk, dtype=np.float32).reshape(-1)
                sr = chunk_sr
                if first_ms is None:
                    first_ms = (time.perf_counter() - t0) * 1000
                parts.append(a)
                on_audio(a)
            if stopped or stop.is_set():
                stopped = True
                break
            if pause > 0:
                gap = np.zeros(int(pause * sr), dtype=np.float32)
                parts.append(gap)
                on_audio(gap)
        elapsed = time.perf_counter() - t0
        x = np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)
        duration = len(x) / sr if sr else 0
        stats = {
            "first_chunk_ms": round(first_ms or 0),
            "gen_seconds": round(elapsed, 2),
            "audio_seconds": round(duration, 2),
            "rtf": round(elapsed / duration, 3) if duration else None,
            "peak_vram": torch.cuda.max_memory_reserved(),
        }
        if stopped:
            on_event({"type": "stopped", "stats": stats})
            return None
        if len(x) == 0:
            raise RuntimeError("Модель не вернула звук")
        item = None
        if req.save:
            item = self.history.add(x, sr, {
                "text": req.text,
                "mode": req.mode,
                "size": req.size,
                "model_id": self.model_id,
                "voice_id": req.voice_id,
                "voice_name": voice["name"] if voice else (req.speaker or ""),
                "speaker": req.speaker,
                "instruct": req.instruct,
                "language": req.language,
                "seed": seed,
                "params": asdict(p),
                "stats": stats,
            })
        on_event({"type": "done", "stats": stats, "item": item, "seed": seed})
        return {"audio": x, "sr": sr, "item": item, "stats": stats}
