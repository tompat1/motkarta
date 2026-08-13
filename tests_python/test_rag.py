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
    assert "Editorial review" in document.text
    assert document.metadata["type"] == "Bakery"


def test_chunk_documents_splits_long_documents():
    document = place_to_rag_document({"id": 1, "name": "Long", "note": "x" * 100})
    chunks = chunk_documents([document], max_chars=30)

    assert len(chunks) > 1
