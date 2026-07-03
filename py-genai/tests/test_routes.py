"""Route-level tests with a mocked LLM backend and a temporary database."""
import importlib
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("LLAMA_URL", "http://localhost:1")
os.environ.setdefault("LLAMA_MODEL", "test-model")


@pytest.fixture()
def ctx(monkeypatch, tmp_path):
    """Fresh app + temp DB. Returns (client, history module, routes.chat module)."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("LLAMA_URL", "http://localhost:1")
    monkeypatch.setenv("LLAMA_MODEL", "test-model")

    import config
    importlib.reload(config)
    import services.history as hist
    import services.llm as llm
    importlib.reload(hist)
    importlib.reload(llm)
    import routes.chat as chat_mod
    import routes.health as health_mod
    import routes.models as models_mod
    import routes.sessions as sessions_mod
    import routes.stats as stats_mod
    importlib.reload(chat_mod)
    importlib.reload(sessions_mod)
    importlib.reload(health_mod)
    importlib.reload(models_mod)
    importlib.reload(stats_mod)
    import app as app_mod
    importlib.reload(app_mod)

    import extensions
    extensions.limiter.enabled = False

    hist.init_db()
    application = app_mod.create_app()
    application.config["TESTING"] = True
    return application.test_client(), hist, chat_mod


def _sse_events(body: bytes) -> list[dict]:
    events = []
    for line in body.decode().splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
    return events


# ── /api/chat ─────────────────────────────────────────────────────────────────

def test_chat_persists_and_returns_response(ctx, monkeypatch):
    client, hist, chat_mod = ctx
    monkeypatch.setattr(chat_mod, "call_llm", lambda *a, **kw: ("Hi there!", {"total_tokens": 5}))

    sid = hist.create_session()
    resp = client.post("/api/chat", json={"message": "Hello", "session_id": sid})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["response"] == "Hi there!"
    assert data["message_id"] is not None

    msgs = hist.get_messages(sid)
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    assert msgs[1]["complete"] == 1


def test_chat_clamps_temperature_and_max_tokens(ctx, monkeypatch):
    client, _hist, chat_mod = ctx
    captured = {}

    def fake_call(messages, model=None, temperature=None, max_tokens=None):
        captured.update(temperature=temperature, max_tokens=max_tokens)
        return "ok", {}

    monkeypatch.setattr(chat_mod, "call_llm", fake_call)
    resp = client.post("/api/chat", json={"message": "hi", "temperature": 99, "max_tokens": -5})
    assert resp.status_code == 200
    assert captured["temperature"] == 2.0
    assert captured["max_tokens"] == 1


def test_chat_rejects_missing_message(ctx):
    client, _hist, _chat = ctx
    assert client.post("/api/chat", json={}).status_code == 400


# ── /api/stream ───────────────────────────────────────────────────────────────

def _token_chunks(tokens, usage=None):
    for t in tokens:
        yield {"choices": [{"delta": {"content": t}}]}
    if usage:
        yield {"choices": [], "usage": usage}


def test_stream_persists_complete_message(ctx, monkeypatch):
    client, hist, chat_mod = ctx
    monkeypatch.setattr(
        chat_mod, "stream_llm",
        lambda *a, **kw: _token_chunks(["Hel", "lo"], usage={"total_tokens": 7}),
    )
    sid = hist.create_session()
    resp = client.post("/api/stream", json={"message": "Hey", "session_id": sid})
    events = _sse_events(resp.data)

    assert events[0]["start"] is True
    tokens = [e["token"] for e in events if "token" in e]
    assert "".join(tokens) == "Hello"
    done = events[-1]
    assert done["done"] is True
    assert done["usage"] == {"total_tokens": 7}

    msgs = hist.get_messages(sid)
    assert msgs[-1]["content"] == "Hello"
    assert msgs[-1]["complete"] == 1
    assert msgs[-1]["token_usage"] == {"total_tokens": 7}


def test_stream_save_false_persists_nothing(ctx, monkeypatch):
    client, hist, chat_mod = ctx
    monkeypatch.setattr(chat_mod, "stream_llm", lambda *a, **kw: _token_chunks(["x"]))
    sid = hist.create_session()
    client.post("/api/stream", json={"message": "Hey", "session_id": sid, "save": False})
    assert hist.get_messages(sid) == []


def test_stream_error_marks_message_incomplete(ctx, monkeypatch):
    client, hist, chat_mod = ctx

    def broken(*a, **kw):
        yield {"choices": [{"delta": {"content": "par"}}]}
        raise RuntimeError("backend died")

    monkeypatch.setattr(chat_mod, "stream_llm", broken)
    sid = hist.create_session()
    resp = client.post("/api/stream", json={"message": "Hey", "session_id": sid})
    events = _sse_events(resp.data)
    assert any("error" in e for e in events)

    msgs = hist.get_messages(sid)
    assert msgs[-1]["content"] == "par"
    assert msgs[-1]["complete"] == 0


# ── Full-text search ──────────────────────────────────────────────────────────

def test_search_finds_message_content(ctx):
    client, hist, _chat = ctx
    sid = hist.create_session(title="Docker chat")
    hist.add_message(sid, "user", "how do containers work?")
    hist.add_message(sid, "assistant", "A container shares the host kernel.")

    resp = client.get("/api/search?q=kernel")
    results = resp.get_json()["results"]
    assert len(results) == 1
    assert results[0]["session_id"] == sid
    assert results[0]["title"] == "Docker chat"
    assert "[MARK]kernel[/MARK]" in results[0]["snippet"]

    # Prefix matching
    assert client.get("/api/search?q=contain").get_json()["results"]
    # Empty and unmatched queries
    assert client.get("/api/search?q=").get_json()["results"] == []
    assert client.get("/api/search?q=zzzznope").get_json()["results"] == []


def test_search_index_updated_on_delete(ctx):
    client, hist, _chat = ctx
    sid = hist.create_session()
    hist.add_message(sid, "user", "ephemeral xyzzy content")
    assert client.get("/api/search?q=xyzzy").get_json()["results"]
    hist.delete_session(sid)
    assert client.get("/api/search?q=xyzzy").get_json()["results"] == []


# ── Presets ───────────────────────────────────────────────────────────────────

def test_preset_crud(ctx):
    client, _hist, _chat = ctx
    resp = client.post("/api/presets", json={"name": "Concise", "text": "Be brief."})
    assert resp.status_code == 201
    pid = resp.get_json()["id"]

    presets = client.get("/api/presets").get_json()
    assert [p["name"] for p in presets] == ["Concise"]

    assert client.post("/api/presets", json={"name": "", "text": ""}).status_code == 400

    client.delete(f"/api/presets/{pid}")
    assert client.get("/api/presets").get_json() == []


# ── Export / import round-trip ────────────────────────────────────────────────

def test_json_export_roundtrips_through_import(ctx):
    client, hist, _chat = ctx
    sid = hist.create_session(title="Round trip", system_prompt="Be nice.")
    hist.add_message(sid, "user", "ping")
    hist.add_message(sid, "assistant", "pong")

    resp = client.get(f"/api/sessions/{sid}/export?format=json")
    assert resp.status_code == 200
    assert resp.mimetype == "application/json"
    exported = json.loads(resp.data)
    assert exported["title"] == "Round trip"

    imported = client.post("/api/sessions/import", json=exported)
    assert imported.status_code == 201
    new_sid = imported.get_json()["session_id"]
    msgs = hist.get_messages(new_sid)
    assert [(m["role"], m["content"]) for m in msgs] == [("user", "ping"), ("assistant", "pong")]
    assert hist.get_session(new_sid)["system_prompt"] == "Be nice."


def test_markdown_export_still_default(ctx):
    client, hist, _chat = ctx
    sid = hist.create_session(title="MD")
    hist.add_message(sid, "user", "hello")
    resp = client.get(f"/api/sessions/{sid}/export")
    assert resp.mimetype == "text/markdown"
    assert b"**You**" in resp.data


# ── Health ────────────────────────────────────────────────────────────────────

class _FakeResp:
    def __init__(self, ids):
        self._ids = ids

    def raise_for_status(self):
        pass

    def json(self):
        return {"data": [{"id": i} for i in self._ids]}


def test_health_deep_model_loaded(ctx, monkeypatch):
    client, _hist, _chat = ctx
    import routes.health as health_mod
    monkeypatch.setattr(health_mod.requests, "get", lambda *a, **kw: _FakeResp(["test-model"]))
    data = client.get("/health?deep=1").get_json()
    assert data["status"] == "healthy"
    assert data["model_loaded"] is True


def test_health_deep_model_missing(ctx, monkeypatch):
    client, _hist, _chat = ctx
    import routes.health as health_mod
    monkeypatch.setattr(health_mod.requests, "get", lambda *a, **kw: _FakeResp(["other-model"]))
    data = client.get("/health?deep=1").get_json()
    assert data["status"] == "degraded"
    assert data["model_loaded"] is False


def test_health_shallow_has_no_model_loaded_field(ctx, monkeypatch):
    client, _hist, _chat = ctx
    import routes.health as health_mod
    monkeypatch.setattr(health_mod.requests, "get", lambda *a, **kw: _FakeResp([]))
    data = client.get("/health").get_json()
    assert data["status"] == "healthy"
    assert "model_loaded" not in data


# ── Context trimming ──────────────────────────────────────────────────────────

def test_build_messages_trims_oldest_history(monkeypatch):
    import services.llm as llm
    monkeypatch.setattr(llm.Config, "LLM_CONTEXT_MAX_TOKENS", 100)

    old = {"role": "user", "content": "x" * 2000}          # ~500 tokens, must be dropped
    recent = {"role": "assistant", "content": "short answer"}
    messages = llm.build_messages([old, recent], "new question", system_prompt="sys")

    contents = [m["content"] for m in messages]
    assert contents[0] == "sys"
    assert contents[-1] == "new question"
    assert old["content"] not in contents
    assert "short answer" in contents


def test_build_messages_dedupes_trailing_user_message():
    import services.llm as llm
    history = [
        {"role": "user", "content": "same question"},
    ]
    messages = llm.build_messages(history, "same question")
    user_turns = [m for m in messages if m["role"] == "user"]
    assert len(user_turns) == 1
