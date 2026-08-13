from __future__ import annotations

import json
from pathlib import Path


def load_rag_corpus(path: str | Path) -> list[dict]:
    with Path(path).open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def answer_query(query: str, documents: list[dict], limit: int = 5) -> list[dict]:
    tokens = {token.lower() for token in query.replace(",", " ").split() if len(token) > 2}

    def score(document: dict) -> float:
        text = f"{document.get('title', '')} {document.get('text', '')}".lower()
        token_score = sum(1 for token in tokens if token in text)
        discovery = float(document.get("metadata", {}).get("discovery_score") or 0) / 100
        return token_score + discovery

    return sorted(documents, key=score, reverse=True)[:limit]
