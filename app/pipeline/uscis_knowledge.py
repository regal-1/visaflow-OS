from __future__ import annotations

import json
import re
from pathlib import Path

from app.models import Citation, SourceChunk


TOKEN_RE = re.compile(r"[a-zA-Z0-9\-]{3,}")


class USCISKnowledgeBase:
    """Knowledge retrieval over USCIS + UCSD source chunks for demo grounding."""

    def __init__(self, chunks_path: str = "data/knowledge_chunks.json") -> None:
        self._chunks_path = Path(chunks_path)
        self._chunks: list[SourceChunk] = []
        self.reload()

    def reload(self) -> None:
        if not self._chunks_path.exists():
            self._chunks = []
            return

        payload = json.loads(self._chunks_path.read_text())
        raw_chunks = payload.get("chunks", [])
        self._chunks = [SourceChunk(**chunk) for chunk in raw_chunks]

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        flow_id: str = "",
        include_ucsd: bool = False,
    ) -> list[Citation]:
        if not self._chunks:
            return []

        query_tokens = self._tokenize(query)
        if not query_tokens:
            return []

        scored: list[tuple[float, SourceChunk]] = []
        for chunk in self._chunks:
            if chunk.source_type == "ucsd_iseo" and not include_ucsd:
                continue
            score = self._score(query_tokens, chunk.text)
            if flow_id and flow_id in chunk.flows:
                score += 1.3
            if score > 0:
                scored.append((score, chunk))

        scored.sort(key=lambda item: item[0], reverse=True)

        citations: list[Citation] = []
        seen: set[str] = set()
        for score, chunk in scored:
            if chunk.source_id in seen:
                continue
            snippet = self._best_snippet(chunk.text, query_tokens)
            citations.append(
                Citation(
                    source_id=chunk.source_id,
                    title=chunk.title,
                    url=chunk.url,
                    snippet=snippet,
                )
            )
            seen.add(chunk.source_id)
            if len(citations) >= top_k:
                break

        return citations

    @staticmethod
    def _tokenize(text: str) -> set[str]:
        return {tok.lower() for tok in TOKEN_RE.findall(text)}

    def _score(self, query_tokens: set[str], text: str) -> float:
        text_tokens = self._tokenize(text)
        overlap = len(query_tokens.intersection(text_tokens))
        if overlap == 0:
            return 0.0

        long_terms_bonus = sum(1 for token in query_tokens if len(token) > 7 and token in text_tokens)
        return float(overlap + (0.5 * long_terms_bonus))

    def _best_snippet(self, text: str, query_tokens: set[str], width: int = 260) -> str:
        lowered = text.lower()
        hit_index = -1
        for token in sorted(query_tokens, key=len, reverse=True):
            idx = lowered.find(token)
            if idx != -1:
                hit_index = idx
                break

        if hit_index == -1:
            return " ".join(text.split())[:width]

        start = max(0, hit_index - width // 3)
        end = min(len(text), start + width)
        return " ".join(text[start:end].split())
