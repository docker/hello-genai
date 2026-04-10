"""
Integration tests for hello-genai service health endpoints.

Prerequisites:
    All services must be running via `docker compose up -d`.

Usage:
    pytest tests/test_health_endpoints.py -v
"""

import pytest
import requests

SERVICES = {
    "go":     {"port": 8080, "name": "go-genai"},
    "python": {"port": 8081, "name": "python-genai"},
    "node":   {"port": 8082, "name": "node-genai"},
    "rust":   {"port": 8083, "name": "rust-genai"},
}

BASE_URL = "http://localhost"
TIMEOUT = 5


def health_url(service_key: str) -> str:
    return f"{BASE_URL}:{SERVICES[service_key]['port']}/health"


@pytest.fixture(params=SERVICES.keys(), ids=lambda k: f"{k}-{SERVICES[k]['port']}")
def service(request):
    """Parametrized fixture that yields each service's key and metadata."""
    key = request.param
    return {**SERVICES[key], "key": key, "url": health_url(key)}


# ------------------------------------------------------------------
# Common health-endpoint tests (run once per service)
# ------------------------------------------------------------------

class TestHealthEndpoints:
    """Tests applied to every service's /health endpoint."""

    def test_returns_200(self, service):
        resp = requests.get(service["url"], timeout=TIMEOUT)
        assert resp.status_code == 200, (
            f"{service['name']} returned {resp.status_code}"
        )

    def test_returns_json(self, service):
        resp = requests.get(service["url"], timeout=TIMEOUT)
        assert resp.headers.get("Content-Type", "").startswith("application/json"), (
            f"{service['name']} Content-Type is {resp.headers.get('Content-Type')}"
        )

    def test_status_healthy(self, service):
        data = requests.get(service["url"], timeout=TIMEOUT).json()
        assert data.get("status") == "healthy", (
            f"{service['name']} status is {data.get('status')!r}, expected 'healthy'"
        )

    def test_has_timestamp(self, service):
        data = requests.get(service["url"], timeout=TIMEOUT).json()
        assert "timestamp" in data, (
            f"{service['name']} health response missing 'timestamp' field"
        )

    def test_rejects_post(self, service):
        resp = requests.post(service["url"], timeout=TIMEOUT)
        assert resp.status_code in (404, 405), (
            f"{service['name']} should reject POST on /health, got {resp.status_code}"
        )


# ------------------------------------------------------------------
# Service-specific health response tests
# ------------------------------------------------------------------

class TestGoHealth:
    URL = health_url("go")

    def test_contains_version(self):
        data = requests.get(self.URL, timeout=TIMEOUT).json()
        assert "version" in data

    def test_contains_go_version(self):
        data = requests.get(self.URL, timeout=TIMEOUT).json()
        assert data.get("go_version", "").startswith("go")

    def test_contains_uptime(self):
        data = requests.get(self.URL, timeout=TIMEOUT).json()
        assert "uptime" in data

    def test_llm_api_ok(self):
        data = requests.get(self.URL, timeout=TIMEOUT).json()
        assert data.get("llm_api") == "ok"

    def test_memory_stats(self):
        data = requests.get(self.URL, timeout=TIMEOUT).json()
        assert "memory" in data
        mem = data["memory"]
        for key in ("alloc", "sys", "total_alloc", "num_gc"):
            assert key in mem, f"missing memory.{key}"


class TestPythonHealth:
    URL = health_url("python")

    def test_llm_api_ok(self):
        data = requests.get(self.URL, timeout=TIMEOUT).json()
        assert data.get("llm_api") == "ok"


class TestNodeHealth:
    URL = health_url("node")

    def test_contains_llm_endpoint(self):
        data = requests.get(self.URL, timeout=TIMEOUT).json()
        assert "llm_endpoint" in data

    def test_contains_model(self):
        data = requests.get(self.URL, timeout=TIMEOUT).json()
        assert "model" in data
        assert "llama" in data["model"]


class TestRustHealth:
    URL = health_url("rust")

    def test_minimal_healthy_response(self):
        data = requests.get(self.URL, timeout=TIMEOUT).json()
        assert data.get("status") == "healthy"
        assert "timestamp" in data
