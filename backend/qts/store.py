import json
import shutil
import time
import uuid
import zipfile
from pathlib import Path

import numpy as np

from . import audio


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


class NotFound(Exception):
    pass


class Voices:
    def __init__(self, root: Path):
        self.root = root / "voices"
        self.root.mkdir(parents=True, exist_ok=True)

    def _dir(self, voice_id: str) -> Path:
        d = self.root / voice_id
        if not voice_id.isalnum() or not (d / "meta.json").exists():
            raise NotFound(voice_id)
        return d

    def list(self) -> list[dict]:
        items = [m for d in self.root.iterdir() if d.is_dir() and (m := _read_json(d / "meta.json"))]
        return sorted(items, key=lambda m: m.get("created", 0), reverse=True)

    def get(self, voice_id: str) -> dict:
        meta = _read_json(self._dir(voice_id) / "meta.json")
        if meta is None:
            raise NotFound(voice_id)
        return meta

    def audio_path(self, voice_id: str) -> Path:
        return self._dir(voice_id) / "ref.wav"

    def prompt_path(self, voice_id: str, size: str, xvec: bool, silence: bool) -> Path:
        kind = "xvec" if xvec else ("icl-s" if silence else "icl")
        return self._dir(voice_id) / f"prompt-{size}-{kind}.pt"

    def create(self, x: np.ndarray, sr: int, name: str, text: str, language: str, source: str = "file") -> dict:
        voice_id = _new_id()
        d = self.root / voice_id
        d.mkdir(parents=True)
        audio.write(d / "ref.wav", x, sr)
        meta = {
            "id": voice_id,
            "name": name.strip() or "Голос",
            "text": text.strip(),
            "language": language,
            "duration": round(len(x) / sr, 2),
            "source": source,
            "created": time.time(),
        }
        _write_json(d / "meta.json", meta)
        return meta

    def update(self, voice_id: str, fields: dict) -> dict:
        d = self._dir(voice_id)
        meta = self.get(voice_id)
        allowed = {k: v for k, v in fields.items() if k in ("name", "text", "language", "favorite")}
        if "text" in allowed and allowed["text"].strip() != meta.get("text"):
            for p in d.glob("prompt-*.pt"):
                p.unlink(missing_ok=True)
        meta.update(allowed)
        _write_json(d / "meta.json", meta)
        return meta

    def delete(self, voice_id: str) -> None:
        shutil.rmtree(self._dir(voice_id), ignore_errors=True)

    def export(self, voice_id: str, path: str) -> None:
        d = self._dir(voice_id)
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(d / "meta.json", "meta.json")
            z.write(d / "ref.wav", "ref.wav")

    def import_(self, path: str) -> dict:
        with zipfile.ZipFile(path) as z:
            meta = json.loads(z.read("meta.json").decode("utf-8"))
            x, sr = audio.read(z.read("ref.wav"))
        return self.create(x, sr, meta.get("name", "Голос"), meta.get("text", ""), meta.get("language", "Auto"), "import")


class History:
    def __init__(self, root: Path):
        self.root = root / "history"
        self.root.mkdir(parents=True, exist_ok=True)

    def _meta_path(self, item_id: str) -> Path:
        p = self.root / f"{item_id}.json"
        if not item_id.isalnum() or not p.exists():
            raise NotFound(item_id)
        return p

    def add(self, x: np.ndarray, sr: int, meta: dict) -> dict:
        item_id = _new_id()
        audio.write(self.root / f"{item_id}.wav", x, sr)
        item = {**meta, "id": item_id, "duration": round(len(x) / sr, 2), "created": time.time()}
        _write_json(self.root / f"{item_id}.json", item)
        return item

    def list(self, offset: int = 0, limit: int = 100, query: str = "") -> dict:
        items = [m for p in self.root.glob("*.json") if (m := _read_json(p))]
        if query:
            q = query.lower()
            items = [m for m in items if q in m.get("text", "").lower() or q in m.get("voice_name", "").lower()]
        items.sort(key=lambda m: m.get("created", 0), reverse=True)
        return {"total": len(items), "items": items[offset : offset + limit]}

    def get(self, item_id: str) -> dict:
        meta = _read_json(self._meta_path(item_id))
        if meta is None:
            raise NotFound(item_id)
        return meta

    def audio_path(self, item_id: str) -> Path:
        self._meta_path(item_id)
        return self.root / f"{item_id}.wav"

    def delete(self, item_id: str) -> None:
        self._meta_path(item_id).unlink(missing_ok=True)
        (self.root / f"{item_id}.wav").unlink(missing_ok=True)

    def clear(self) -> None:
        for p in self.root.iterdir():
            if p.suffix in (".json", ".wav"):
                p.unlink(missing_ok=True)
