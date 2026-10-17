import math
import re

_SENT = re.compile(r"(?<=[.!?…])\s+|(?<=[。！？])|\n")
_CLAUSE = re.compile(r"[;:—–；：]\s*|,\s+|，")


def _cut(s: str, limit: int, pattern: re.Pattern) -> int:
    cut = -1
    for m in pattern.finditer(s, 0, limit):
        cut = m.end()
    return cut


def _hard_split(s: str, limit: int) -> list[str]:
    out = []
    if len(s) > limit:
        limit = min(limit, math.ceil(len(s) / math.ceil(len(s) / limit) * 1.15))
    while len(s) > limit:
        cut = _cut(s, limit, _CLAUSE)
        if cut <= limit // 3:
            cut = _cut(s, limit, re.compile(r"\s+"))
        if cut <= limit // 3:
            cut = limit
        out.append(s[:cut].strip())
        s = s[cut:].strip()
    if s:
        out.append(s)
    return out


def _pack(sentences: list[str], limit: int) -> list[str]:
    chunks: list[str] = []
    cur = ""
    for s in sentences:
        if cur and len(cur) + 1 + len(s) > limit:
            chunks.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        chunks.append(cur)
    return chunks


def _balanced(sentences: list[str], max_chars: int) -> list[str]:
    greedy = _pack(sentences, max_chars)
    if len(greedy) < 2:
        return greedy
    total = sum(len(s) for s in sentences) + len(sentences) - 1
    target = max(math.ceil(total / len(greedy) * 1.1), max(len(s) for s in sentences))
    balanced = _pack(sentences, min(max_chars, target))
    return balanced if len(balanced) <= len(greedy) else greedy


def split_text(text: str, max_chars: int = 500, pause: float = 0.25, paragraph_pause: float = 0.5) -> list[tuple[str, float]]:
    chunks: list[tuple[str, float]] = []
    for para in (p.strip() for p in re.split(r"\n\s*\n", text)):
        if not para:
            continue
        sentences = [piece for s in _SENT.split(para) if s.strip() for piece in _hard_split(s.strip(), max_chars)]
        parts = _balanced(sentences, max_chars)
        chunks += [(c, pause) for c in parts[:-1]]
        chunks.append((parts[-1], paragraph_pause))
    if chunks:
        chunks[-1] = (chunks[-1][0], 0.0)
    return chunks
