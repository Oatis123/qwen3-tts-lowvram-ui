import io
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 24000

FORMATS = {
    "wav": ("WAV", "PCM_16"),
    "mp3": ("MP3", "MPEG_LAYER_III"),
    "flac": ("FLAC", "PCM_16"),
    "ogg": ("OGG", "VORBIS"),
}


def to_mono(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    return x.mean(axis=1) if x.ndim > 1 else x


def resample(x: np.ndarray, sr: int, target: int) -> np.ndarray:
    if sr == target:
        return x
    import soxr

    return soxr.resample(x, sr, target).astype(np.float32)


def read(source: bytes | str | Path, target_sr: int | None = SR) -> tuple[np.ndarray, int]:
    data, sr = sf.read(io.BytesIO(source) if isinstance(source, bytes) else str(source), dtype="float32", always_2d=False)
    x = to_mono(data)
    if target_sr:
        x, sr = resample(x, sr, target_sr), target_sr
    return x, sr


def write(path: str | Path, x: np.ndarray, sr: int, fmt: str = "wav") -> None:
    container, subtype = FORMATS[fmt]
    sf.write(str(path), np.clip(x, -1.0, 1.0), sr, format=container, subtype=subtype)


def wav_bytes(x: np.ndarray, sr: int) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, np.clip(x, -1.0, 1.0), sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def trim_silence(x: np.ndarray, sr: int, threshold_db: float = -45.0, pad: float = 0.1) -> np.ndarray:
    if len(x) == 0:
        return x
    win = max(1, int(sr * 0.02))
    n = len(x) // win
    if n == 0:
        return x
    rms = np.sqrt(np.mean(x[: n * win].reshape(n, win) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms / (np.max(np.abs(x)) + 1e-9))
    loud = np.where(db > threshold_db)[0]
    if len(loud) == 0:
        return x
    start = max(0, loud[0] * win - int(pad * sr))
    end = min(len(x), (loud[-1] + 1) * win + int(pad * sr))
    return x[start:end]


def normalize(x: np.ndarray, peak: float = 0.95) -> np.ndarray:
    m = float(np.max(np.abs(x))) if len(x) else 0.0
    return x * (peak / m) if m > 1e-6 else x


class DecodeError(Exception):
    pass


def decode_any(source: bytes | str | Path, target_sr: int = SR, max_seconds: float = 600.0) -> tuple[np.ndarray, int, bool]:
    import av

    limit = int(max_seconds * target_sr)
    parts: list[np.ndarray] = []
    total = 0
    truncated = False
    with av.open(io.BytesIO(source) if isinstance(source, bytes) else str(source)) as container:
        stream = next((st for st in container.streams if st.type == "audio"), None)
        if stream is None:
            raise DecodeError("В файле нет звуковой дорожки")
        resampler = av.AudioResampler(format="flt", layout="mono", rate=target_sr)
        for frame in container.decode(stream):
            for out in resampler.resample(frame):
                a = out.to_ndarray().reshape(-1).astype(np.float32, copy=False)
                parts.append(a)
                total += len(a)
            if total >= limit:
                truncated = True
                break
        else:
            for out in resampler.resample(None):
                parts.append(out.to_ndarray().reshape(-1).astype(np.float32, copy=False))
    if not parts:
        raise DecodeError("Не удалось прочитать звук из файла")
    x = np.concatenate(parts)[:limit]
    return x, target_sr, truncated
