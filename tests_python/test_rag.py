from motkarta.concierge import build_concierge_prompt, synthesize_concierge_response
from motkarta.rag import chunk_documents, place_to_rag_document


def test_place_to_rag_document_includes_evidence_and_scores():
    document = place_to_rag_document(
        {
            "id": 1,
            "name": "Test Bakery",
            "kind": "Bakery",
            "area": "Vasastan",
            "note": "Small bakery.",
            "tags": ["Cardamom", "Independent"],
            "evidenceLabel": "Editorial review",
            "scores": {"quality": 82.25},
        }
    )

    assert document.id == "1"
    assert document.metadata["evidence_label"] == "Editorial review"
    assert "verified independent" not in document.text
    assert document.metadata["type"] == "Bakery"


def test_chunk_documents_splits_long_documents():
    document = place_to_rag_document({"id": 1, "name": "Long", "address": "x" * 100})
    chunks = chunk_documents([document], max_chars=30)

    assert len(chunks) > 1


def test_concierge_prompt_and_synthesis():
    documents = [
        {
            "id": "osm:node:101",
            "title": "Drop Coffee",
            "text": "Name: Drop Coffee\nType: Specialty coffee\nNeighbourhood: Central Stockholm",
            "metadata": {
                "establishment_type": "Specialty coffee",
                "neighbourhood": "Central Stockholm",
                "discovery_score": 85.0,
                "discovery_reasons": "it appears independent; opening hours are listed",
            },
        }
    ]

    prompt = build_concierge_prompt("filter coffee", documents)
    assert "Stockholm Independent Food Map AI Concierge" in prompt
    assert "Drop Coffee" in prompt

    response = synthesize_concierge_response("filter coffee", documents)
    assert response["grounded"] is True
    assert "Drop Coffee" in response["synthesized_answer"]
    assert len(response["retrieved_places"]) == 1
