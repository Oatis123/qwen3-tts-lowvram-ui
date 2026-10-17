import gc
import threading
from pathlib import Path

import numpy as np

from . import audio

LANG_MAP = {
    "ru": "Russian", "en": "English", "zh": "Chinese", "ja": "Japanese", "ko": "Korean",
    "de": "German", "fr": "French", "es": "Spanish", "it": "Italian", "pt": "Portuguese",
}
LANG_CODES = {v: k for k, v in LANG_MAP.items()}


class Asr:
    def __init__(self):
        self.lock = threading.Lock()
        self.active: str | None = None

    def transcribe(
        self,
        x: np.ndarray,
        sr: int,
        model_dir: Path,
        language: str | None = None,
        device: str = "cuda",
        compute_type: str = "int8_float16",
        beam_size: int = 5,
        vad: bool = True,
    ) -> dict:
        from faster_whisper import WhisperModel

        x16 = audio.resample(x, sr, 16000)
        lang = LANG_CODES.get(language or "", None)
        with self.lock:
            model = None
            try:
                try:
                    model = WhisperModel(str(model_dir), device=device, compute_type=compute_type)
                except ValueError:
                    model = WhisperModel(str(model_dir), device=device, compute_type="float16" if device == "cuda" else "int8")
                segments, info = model.transcribe(x16, language=lang, beam_size=beam_size, vad_filter=vad)
                text = " ".join(s.text.strip() for s in segments).strip()
                return {
                    "text": text,
                    "language": LANG_MAP.get(info.language, "Auto"),
                    "language_code": info.language,
                    "language_probability": round(float(info.language_probability), 3),
                }
            finally:
                del model
                gc.collect()
