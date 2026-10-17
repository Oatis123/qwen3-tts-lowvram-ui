import re

_SENT = re.compile(r"(?<=[.!?…])\s+|(?<=[。！？])|\n")
_SOFT = re.compile(r"[,;:—–，；：]\s*|\s+")


def _hard_split(s: str, limit: int) -> list[str]:
    out = []
    while len(s) > limit:
        cut = -1
        for m in _SOFT.finditer(s, 0, limit):
            cut = m.end()
        if cut <= limit // 3:
            cut = limit
        out.append(s[:cut].strip())
        s = s[cut:].strip()
    if s:
        out.append(s)
    return out


def split_text(text: str, max_chars: int = 220, pause: float = 0.15, paragraph_pause: float = 0.45) -> list[tuple[str, float]]:
    chunks: list[tuple[str, float]] = []
    for para in (p.strip() for p in re.split(r"\n\s*\n", text)):
        if not para:
            continue
        cur = ""
        for sent in (s.strip() for s in _SENT.split(para)):
            if not sent:
                continue
            for piece in _hard_split(sent, max_chars):
                if cur and len(cur) + 1 + len(piece) > max_chars:
                    chunks.append((cur, pause))
                    cur = piece
                else:
                    cur = f"{cur} {piece}".strip()
        if cur:
            chunks.append((cur, paragraph_pause))
    if chunks:
        chunks[-1] = (chunks[-1][0], 0.0)
    return chunks
