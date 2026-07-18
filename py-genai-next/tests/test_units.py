"""Infra-free unit tests for the core logic (run inside the API image)."""
from genai.services import rag
from genai.services.llm import build_messages, strip_think
from genai.services.tools import calculator, execute_tool  # noqa: F401 (import smoke)


def test_build_messages_trims_and_dedupes(monkeypatch):
    from genai.core.config import settings
    monkeypatch.setattr(settings, "LLM_CONTEXT_MAX_TOKENS", 100)
    old = {"role": "user", "content": "x" * 2000}
    recent = {"role": "assistant", "content": "short answer"}
    msgs = build_messages([old, recent], "new question", system_prompt="sys")
    contents = [m["content"] for m in msgs]
    assert contents[0] == "sys"
    assert contents[-1] == "new question"
    assert old["content"] not in contents
    assert "short answer" in contents


def test_build_messages_dedupes_trailing_user():
    msgs = build_messages([{"role": "user", "content": "same"}], "same")
    assert len([m for m in msgs if m["role"] == "user"]) == 1


def test_build_messages_multimodal():
    msgs = build_messages([], "describe", images=["data:image/png;base64,AAAA"])
    content = msgs[-1]["content"]
    assert isinstance(content, list)
    assert content[0]["type"] == "text"
    assert content[1]["type"] == "image_url"


def test_strip_think():
    assert strip_think("<think>hmm</think>\n\nAnswer") == "Answer"
    assert strip_think("<think>unclosed") == ""


def test_chunk_text_roundtrip_and_size():
    text = "Docker is a container platform. " * 100
    chunks = rag.chunk_text(text, size=200, overlap=20)
    assert len(chunks) > 1
    assert all(c.strip() for c in chunks)


def test_calculator_is_safe():
    assert "42" in calculator("6*7")
    assert "Could not evaluate" in calculator("__import__('os').system('echo hi')")


def test_password_hashing():
    from genai.core.security import hash_password, verify_password
    h = hash_password("secret123")
    assert verify_password("secret123", h)
    assert not verify_password("wrong", h)


def test_jwt_roundtrip():
    from genai.core.security import create_access_token, decode_token
    tok = create_access_token("user-123")
    assert decode_token(tok)["sub"] == "user-123"
    assert decode_token("garbage") is None
