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
    import services.memory as mem
    importlib.reload(mem)
    import routes.chat as chat_mod
    import routes.health as health_mod
    import routes.memory as memory_mod
    import routes.models as models_mod
    import routes.sessions as sessions_mod
    import routes.stats as stats_mod
    importlib.reload(chat_mod)
    importlib.reload(sessions_mod)
    importlib.reload(health_mod)
    importlib.reload(models_mod)
    importlib.reload(stats_mod)
    importlib.reload(memory_mod)
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


def _reasoning_chunks():
    yield {"choices": [{"delta": {"reasoning_content": "think a"}}]}
    yield {"choices": [{"delta": {"reasoning_content": " b"}}]}
    yield {"choices": [{"delta": {"content": "final answer"}}]}


def test_stream_wraps_reasoning_in_think(ctx, monkeypatch):
    client, hist, chat_mod = ctx
    monkeypatch.setattr(chat_mod, "stream_llm", lambda *a, **kw: _reasoning_chunks())
    sid = hist.create_session()
    resp = client.post("/api/stream", json={"message": "hi", "session_id": sid})
    events = _sse_events(resp.data)
    tokens = "".join(e["token"] for e in events if "token" in e)
    assert tokens == "<think>think a b</think>\n\nfinal answer"
    saved = hist.get_messages(sid)[-1]["content"]
    assert saved.startswith("<think>") and "final answer" in saved


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


# ── Model discovery ───────────────────────────────────────────────────────────

def test_models_live_discovery(ctx, monkeypatch):
    client, _hist, _chat = ctx
    import routes.models as models_mod
    live = ["docker.io/ai/gemma4:latest", "docker.io/ai/llama3:latest"]
    monkeypatch.setattr(models_mod.requests, "get", lambda *a, **kw: _FakeResp(live))
    data = client.get("/api/models?refresh=1").get_json()
    assert data["source"] == "live"
    assert data["models"] == live
    # Configured test-model isn't in the live list → default to the first available
    assert data["current"] == live[0]


def test_models_current_prefers_configured_when_available(ctx, monkeypatch):
    client, _hist, _chat = ctx
    import routes.models as models_mod
    live = ["other:latest", "test-model"]
    monkeypatch.setattr(models_mod.requests, "get", lambda *a, **kw: _FakeResp(live))
    data = client.get("/api/models?refresh=2").get_json()
    assert data["current"] == "test-model"


def test_models_fallback_when_backend_unreachable(ctx, monkeypatch):
    client, _hist, _chat = ctx
    import routes.models as models_mod

    def boom(*a, **kw):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(models_mod.requests, "get", boom)
    monkeypatch.setenv("AVAILABLE_MODELS", "m1,m2")
    data = client.get("/api/models?refresh=3").get_json()
    assert data["source"] == "fallback"
    assert data["models"] == ["m1", "m2"]


def test_models_fallback_to_configured_model(ctx, monkeypatch):
    client, _hist, _chat = ctx
    import routes.models as models_mod
    monkeypatch.setattr(models_mod.requests, "get", lambda *a, **kw: _FakeResp([]))
    monkeypatch.delenv("AVAILABLE_MODELS", raising=False)
    data = client.get("/api/models?refresh=4").get_json()
    assert data["source"] == "fallback"
    assert data["models"] == ["test-model"]


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


def test_build_messages_multimodal_images():
    import services.llm as llm
    messages = llm.build_messages([], "describe this", images=["data:image/png;base64,AAAA"])
    content = messages[-1]["content"]
    assert isinstance(content, list)
    assert content[0] == {"type": "text", "text": "describe this"}
    assert content[1]["type"] == "image_url"


# ── Per-message model (#1) ────────────────────────────────────────────────────

def test_chat_persists_model_per_message(ctx, monkeypatch):
    client, hist, chat_mod = ctx
    monkeypatch.setattr(chat_mod, "call_llm", lambda *a, **kw: ("hi", {}))
    sid = hist.create_session()
    resp = client.post("/api/chat", json={"message": "hey", "session_id": sid})
    assert resp.get_json()["model"] == "test-model"
    assert hist.get_messages(sid)[-1]["model"] == "test-model"


def test_stream_persists_model_per_message(ctx, monkeypatch):
    client, hist, chat_mod = ctx
    monkeypatch.setattr(chat_mod, "stream_llm", lambda *a, **kw: _token_chunks(["hi"]))
    sid = hist.create_session()
    resp = client.post("/api/stream", json={"message": "hey", "session_id": sid, "model": "custom:1"})
    events = _sse_events(resp.data)
    assert events[-1]["model"] == "custom:1"
    assert hist.get_messages(sid)[-1]["model"] == "custom:1"


# ── Full backup (#11) ─────────────────────────────────────────────────────────

def test_backup_export_import_roundtrip(ctx):
    client, hist, _chat = ctx
    sid = hist.create_session(title="Backup me", system_prompt="Be nice.")
    hist.add_message(sid, "user", "hello")
    hist.add_message(sid, "assistant", "hi", model="m1")
    hist.create_preset("P", "text")

    backup = client.get("/api/backup").get_json()
    assert len(backup["sessions"]) == 1
    assert backup["presets"] == [{"name": "P", "text": "text"}]

    resp = client.post("/api/backup", json=backup)
    assert resp.status_code == 201
    assert resp.get_json()["imported_sessions"] == 1
    # Original + restored
    assert len(hist.list_sessions()) == 2


def test_backup_import_rejects_invalid(ctx):
    client, _hist, _chat = ctx
    assert client.post("/api/backup", json={"nope": 1}).status_code == 400


# ── Config + extract (#7, #9) ─────────────────────────────────────────────────

def test_config_endpoint(ctx):
    client, _hist, _chat = ctx
    cfg = client.get("/api/config").get_json()
    assert cfg["context_max_tokens"] > 0
    assert "max_images_per_message" in cfg
    assert cfg["auth_enabled"] is False


def test_extract_rejects_non_pdf(ctx):
    client, _hist, _chat = ctx
    import io
    data = {"file": (io.BytesIO(b"hello"), "notes.txt")}
    resp = client.post("/api/extract", data=data, content_type="multipart/form-data")
    assert resp.status_code == 400


def test_extract_requires_file(ctx):
    client, _hist, _chat = ctx
    assert client.post("/api/extract").status_code == 400


# ── Health deep returns 503 when degraded (#8) ────────────────────────────────

def test_health_deep_returns_503_when_model_missing(ctx, monkeypatch):
    client, _hist, _chat = ctx
    import routes.health as health_mod
    monkeypatch.setattr(health_mod.requests, "get", lambda *a, **kw: _FakeResp(["other"]))
    resp = client.get("/health?deep=1")
    assert resp.status_code == 503
    assert resp.get_json()["status"] == "degraded"


# ── Persistent chat memory ────────────────────────────────────────────────────

def test_memory_crud(ctx):
    client, _hist, _chat = ctx
    resp = client.post("/api/memories", json={"content": "User likes Python"})
    assert resp.status_code == 201
    mid = resp.get_json()["id"]

    # Duplicate (case-insensitive) returns the existing memory, not a second row
    dup = client.post("/api/memories", json={"content": "user likes python"})
    assert dup.get_json()["id"] == mid
    assert len(client.get("/api/memories").get_json()) == 1

    # Pause, then verify flag
    client.patch(f"/api/memories/{mid}", json={"enabled": False})
    assert client.get("/api/memories").get_json()[0]["enabled"] == 0

    # Edit content
    client.patch(f"/api/memories/{mid}", json={"content": "User loves Python"})
    assert client.get("/api/memories").get_json()[0]["content"] == "User loves Python"

    # Delete one, then clear all
    client.delete(f"/api/memories/{mid}")
    assert client.get("/api/memories").get_json() == []
    client.post("/api/memories", json={"content": "a"})
    client.post("/api/memories", json={"content": "b"})
    assert client.delete("/api/memories").get_json()["deleted"] == 2


def test_memory_rejects_empty(ctx):
    client, _hist, _chat = ctx
    assert client.post("/api/memories", json={}).status_code == 400


def test_chat_injects_memories_into_system_prompt(ctx, monkeypatch):
    client, hist, chat_mod = ctx
    hist.create_memory("User's name is Anirban")
    hist.create_memory("Paused fact")
    paused = [m for m in hist.list_memories() if m["content"] == "Paused fact"][0]
    hist.update_memory(paused["id"], enabled=False)

    captured = {}

    def fake_call(messages, **kw):
        captured["system"] = messages[0]["content"]
        return "ok", {}

    monkeypatch.setattr(chat_mod, "call_llm", fake_call)
    client.post("/api/chat", json={"message": "hi"})
    assert "User's name is Anirban" in captured["system"]
    assert "Paused fact" not in captured["system"]


def test_chat_use_memory_false_skips_injection(ctx, monkeypatch):
    client, hist, chat_mod = ctx
    hist.create_memory("User's name is Anirban")
    captured = {}

    def fake_call(messages, **kw):
        captured["system"] = messages[0]["content"]
        return "ok", {}

    monkeypatch.setattr(chat_mod, "call_llm", fake_call)
    client.post("/api/chat", json={"message": "hi", "use_memory": False})
    assert "Anirban" not in captured["system"]


def test_memory_extraction_stores_and_dedupes(ctx, monkeypatch):
    _client, hist, _chat = ctx
    import services.memory as mem_mod
    monkeypatch.setattr(
        mem_mod, "call_llm",
        lambda *a, **kw: ("<think>hmm</think>\nUser prefers dark mode\nNONE\nUser prefers dark mode", {}),
    )
    stored = mem_mod.extract_and_store("I always use dark mode")
    assert stored == ["User prefers dark mode"]
    # Second run: same fact already known → nothing new
    assert mem_mod.extract_and_store("I always use dark mode") == []


def test_memory_extraction_respects_cap(ctx, monkeypatch):
    _client, hist, _chat = ctx
    import services.memory as mem_mod
    monkeypatch.setattr(mem_mod.Config, "MEMORY_MAX_ITEMS", 1)
    hist.create_memory("existing fact")
    called = []
    monkeypatch.setattr(mem_mod, "call_llm", lambda *a, **kw: called.append(1) or ("new fact", {}))
    assert mem_mod.extract_and_store("anything") == []
    assert not called  # cap reached → LLM never invoked


def test_backup_includes_memories(ctx):
    client, hist, _chat = ctx
    hist.create_memory("User likes Docker")
    backup = client.get("/api/backup").get_json()
    assert backup["memories"] == [{"content": "User likes Docker", "enabled": 1}]

    client.delete("/api/memories")
    client.post("/api/backup", json=backup)
    assert [m["content"] for m in hist.list_memories()] == ["User likes Docker"]


def test_config_includes_memory_flags(ctx):
    client, _hist, _chat = ctx
    cfg = client.get("/api/config").get_json()
    assert cfg["memory_enabled"] is True
    assert cfg["memory_max_items"] > 0


# ── Optional authentication (#3) ──────────────────────────────────────────────

@pytest.fixture()
def auth_client(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "auth.db"))
    monkeypatch.setenv("LLAMA_URL", "http://localhost:1")
    monkeypatch.setenv("LLAMA_MODEL", "test-model")
    monkeypatch.setenv("APP_API_KEY", "s3cret")
    import config
    importlib.reload(config)
    import services.history as hist
    importlib.reload(hist)
    for name in ("routes.chat", "routes.health", "routes.models", "routes.sessions", "routes.stats"):
        importlib.reload(importlib.import_module(name))
    import app as app_mod
    importlib.reload(app_mod)
    import extensions
    extensions.limiter.enabled = False
    hist.init_db()
    application = app_mod.create_app()
    application.config["TESTING"] = True
    return application.test_client()


def test_auth_blocks_api_without_key(auth_client):
    assert auth_client.get("/api/sessions").status_code == 401


def test_auth_allows_api_with_key(auth_client):
    resp = auth_client.get("/api/sessions", headers={"X-API-Key": "s3cret"})
    assert resp.status_code == 200


def test_auth_allows_bearer_token(auth_client):
    resp = auth_client.get("/api/sessions", headers={"Authorization": "Bearer s3cret"})
    assert resp.status_code == 200


def test_auth_health_is_public(auth_client):
    assert auth_client.get("/health").status_code == 200


def test_auth_index_redirects_to_login(auth_client):
    resp = auth_client.get("/", follow_redirects=False)
    assert resp.status_code == 302
    assert "/login" in resp.headers["Location"]


def test_auth_login_sets_session(auth_client):
    resp = auth_client.post("/login", data={"api_key": "s3cret"}, follow_redirects=False)
    assert resp.status_code == 302
    # Now authorized via session cookie
    assert auth_client.get("/api/sessions").status_code == 200
