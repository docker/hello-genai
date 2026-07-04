"""Unit tests for services/history.py using a temporary in-memory DB."""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(autouse=True)
def tmp_db(monkeypatch):
    """Point Config.DATABASE_PATH at a fresh temp file for each test."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    monkeypatch.setenv("DATABASE_PATH", path)
    # Re-import after env change so Config picks up the new path
    import importlib

    import config as cfg_mod
    importlib.reload(cfg_mod)
    import services.history as hist_mod
    importlib.reload(hist_mod)
    hist_mod.init_db()
    yield hist_mod
    os.unlink(path)


def test_create_and_get_session(tmp_db):
    sid = tmp_db.create_session(title="Hello")
    session = tmp_db.get_session(sid)
    assert session is not None
    assert session["title"] == "Hello"
    assert session["pinned"] == 0


def test_list_sessions_order(tmp_db):
    s1 = tmp_db.create_session(title="First")
    tmp_db.create_session(title="Second")
    tmp_db.pin_session(s1, pinned=True)
    sessions = tmp_db.list_sessions()
    assert sessions[0]["id"] == s1  # pinned first


def test_update_session_title(tmp_db):
    sid = tmp_db.create_session()
    tmp_db.update_session(sid, title="Updated")
    assert tmp_db.get_session(sid)["title"] == "Updated"


def test_update_session_noop(tmp_db):
    sid = tmp_db.create_session(title="Stable")
    tmp_db.update_session(sid)  # no args — should not raise
    assert tmp_db.get_session(sid)["title"] == "Stable"


def test_add_and_get_messages(tmp_db):
    sid = tmp_db.create_session()
    tmp_db.add_message(sid, "user", "hi")
    tmp_db.add_message(sid, "assistant", "hello", token_usage={"total_tokens": 5})
    msgs = tmp_db.get_messages(sid)
    assert len(msgs) == 2
    assert msgs[1]["token_usage"]["total_tokens"] == 5


def test_delete_session_cascades(tmp_db):
    sid = tmp_db.create_session()
    tmp_db.add_message(sid, "user", "test")
    tmp_db.delete_session(sid)
    assert tmp_db.get_session(sid) is None
    assert tmp_db.get_messages(sid) == []


def test_delete_messages_from(tmp_db):
    sid = tmp_db.create_session()
    id1 = tmp_db.add_message(sid, "user", "a")
    id2 = tmp_db.add_message(sid, "assistant", "b")
    tmp_db.delete_messages_from(sid, id2)
    msgs = tmp_db.get_messages(sid)
    assert len(msgs) == 1
    assert msgs[0]["id"] == id1


def test_set_message_feedback(tmp_db):
    sid = tmp_db.create_session()
    mid = tmp_db.add_message(sid, "assistant", "great answer")
    tmp_db.set_message_feedback(mid, "up")
    msgs = tmp_db.get_messages(sid)
    assert msgs[0]["feedback"] == "up"


def test_get_stats(tmp_db):
    sid = tmp_db.create_session()
    tmp_db.add_message(sid, "user", "q", token_usage={"prompt_tokens": 3, "completion_tokens": 0, "total_tokens": 3})
    tmp_db.add_message(sid, "assistant", "a", token_usage={"prompt_tokens": 0, "completion_tokens": 7, "total_tokens": 7})
    stats = tmp_db.get_stats()
    assert stats["total_sessions"] == 1
    assert stats["total_messages"] == 2
    assert stats["total_tokens"] == 10
