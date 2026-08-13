from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RagDocument:
    id: str
    title: str
    text: str
    metadata: dict[str, str | int | float | bool | None]


def place_to_rag_document(place: dict) -> RagDocument:
    """Create a retrieval document for a place from normalized place/evidence data."""

    tags = place.get("tags") or []
    scores = place.get("scores") or {}
    evidence_label = place.get("evidenceLabel") or place.get("evidence_label") or ""
    text = "\n".join(
        part
        for part in [
            f"Name: {place.get('name')}",
            f"Type: {place.get('kind') or place.get('type')}",
            f"Area: {place.get('area') or place.get('district')}",
            f"Description: {place.get('note') or place.get('description')}",
            f"Tags: {', '.join(tags)}" if tags else "",
            f"Evidence: {evidence_label}" if evidence_label else "",
            "Scores: "
            + ", ".join(f"{key}={round(value, 2)}" for key, value in scores.items() if isinstance(value, int | float))
            if scores
            else "",
        ]
        if part
    )
    return RagDocument(
        id=str(place.get("id")),
        title=str(place.get("name")),
        text=text,
        metadata={
            "place_id": place.get("id"),
            "type": place.get("kind") or place.get("type"),
            "area": place.get("area") or place.get("district"),
        },
    )


def chunk_documents(documents: list[RagDocument], max_chars: int = 1200) -> list[RagDocument]:
    chunks: list[RagDocument] = []
    for document in documents:
        text = document.text
        if len(text) <= max_chars:
            chunks.append(document)
            continue
        for index, start in enumerate(range(0, len(text), max_chars)):
            chunks.append(
                RagDocument(
                    id=f"{document.id}:{index}",
                    title=document.title,
                    text=text[start : start + max_chars],
                    metadata={**document.metadata, "chunk": index},
                )
            )
    return chunks
