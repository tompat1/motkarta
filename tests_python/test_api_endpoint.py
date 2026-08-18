from fastapi.testclient import TestClient
from scripts.api_endpoint import app

client = TestClient(app)


def test_health_check_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"


def test_concierge_chat_endpoint():
    response = client.post("/api/v1/concierge/chat", json={"message": "Vasastan bakery"})
    assert response.status_code == 200
    data = response.json()
    assert "reply" in data
    assert "sources" in data
