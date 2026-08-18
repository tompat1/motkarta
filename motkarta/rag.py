from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RagDocument:
    id: str
    title: str
    text: str
    metadata: dict[str, str | int | float | bool | None]


def place_to_rag_document(place: dict) -> RagDocument:
    """Create a retrieval document for a place with rich semantic narrative synthesis (Blueprint 3.1)."""

    tags = place.get("tags") or []
    scores = place.get("scores") or {}
    name = place.get("name") or "Establishment"
    kind = place.get("kind") or place.get("type") or "venue"
    area = place.get("area") or place.get("district") or "Stockholm"
    is_gem = bool(place.get("is_hidden_gem") or place.get("is_gem"))
    cuisine = place.get("cuisine") or ""

    gem_status_str = (
        "This establishment is officially classified as a Motkarta Hidden Gem based on its highly specialized offerings, high structural complexity, and lower mainstream tourist foot traffic profile."
        if is_gem
        else "This establishment is a verified local independent destination."
    )

    feature_items = []
    if cuisine:
        feature_items.append(f"cuisine: {cuisine}")
    if tags:
        feature_items.extend(tags[:5])
    features_str = ", ".join(feature_items) if feature_items else "authentic local food and beverage service"

    narrative_text = (
        f"ID: {place.get('id')}. Name: {name} is a verified independent {kind} located in the {area} neighborhood of Stockholm. "
        f"{gem_status_str} Features include {features_str}. "
        f"It exhibits high community stability and is fully independent from commercial corporate chains."
    )

    evidence_label = place.get("evidenceLabel") or place.get("evidence_label") or ""
    if evidence_label:
        narrative_text += f" Evidence proof: {evidence_label}."

    if scores:
        score_str = ", ".join(f"{key}={round(value, 2)}" for key, value in scores.items() if isinstance(value, int | float))
        narrative_text += f" Auditable score profile: {score_str}."

    return RagDocument(
        id=str(place.get("id")),
        title=str(name),
        text=narrative_text,
        metadata={
            "place_id": place.get("id"),
            "type": kind,
            "area": area,
            "is_hidden_gem": is_gem,
            "quality_score": scores.get("quality", 0) if isinstance(scores, dict) else 0,
            "discovery_score": scores.get("discovery", 0) if isinstance(scores, dict) else 0,
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
