from fastapi.testclient import TestClient

from agromind_api.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_analyze_returns_all_specialists(monkeypatch) -> None:
    async def no_core_evidence(field):
        return None, None, None

    async def no_external_evidence(*args, **kwargs):
        return None

    async def no_gemini(prompt):
        return None

    monkeypatch.setattr("agromind_api.main._gather_core_evidence", no_core_evidence)
    monkeypatch.setattr("agromind_api.main.get_authorized_evidence", no_external_evidence)
    monkeypatch.setattr("agromind_api.main.gemini", no_gemini)

    response = client.post(
        "/api/analyze",
        json={
            "crop": "Tomato",
            "district": "Anantapur",
            "soil": "Red sandy loam",
            "moisture": "22",
            "rain": "18",
            "issue": "Yellow-brown spots",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert [agent["agent"] for agent in body["agents"]] == [
        "Disease",
        "Irrigation",
        "Resources",
        "Market",
    ]
    assert len(body["plan"]) >= 3
    assert len(body["sources"]) == 5


def test_ecosystem_reports_all_agents_and_orchestrator() -> None:
    response = client.get("/api/ecosystem")
    assert response.status_code == 200
    body = response.json()
    assert body["orchestrator"]["name"] == "Central Orchestrator"
    assert [agent["name"] for agent in body["agents"]] == [
        "Disease",
        "Irrigation",
        "Resources",
        "Market",
    ]


def test_source_status_lists_all_authorized_sources() -> None:
    response = client.get("/api/source-status")
    assert response.status_code == 200
    names = {source["name"] for source in response.json()["sources"]}
    assert names == {
        "Open-Meteo",
        "data.gov.in",
        "AGMARKNET",
        "Krishi DSS",
        "Soil Health Card",
    }
