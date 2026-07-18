"""Infra-free unit tests for the PAT token service."""
import datetime
from types import SimpleNamespace

from genai.services import pat


def test_generate_shape():
    plaintext, hint, token_hash = pat.generate()
    assert plaintext.startswith("genai_pat_")
    assert len(plaintext) > 40
    assert hint.startswith("genai_pat_") and "…" in hint and plaintext.endswith(hint[-4:])
    assert len(token_hash) == 64 and int(token_hash, 16) >= 0  # sha256 hex


def test_hash_is_deterministic_and_matches_generate():
    plaintext, _hint, token_hash = pat.generate()
    assert pat.hash_token(plaintext) == token_hash
    assert pat.hash_token("genai_pat_x") != pat.hash_token("genai_pat_y")


def test_clamp_expiry_days():
    assert pat.clamp_expiry_days(None) == 90
    assert pat.clamp_expiry_days(0) == 90
    assert pat.clamp_expiry_days(-5) == 90
    assert pat.clamp_expiry_days(30) == 30
    assert pat.clamp_expiry_days(9999) == 365


def test_status_of():
    now = datetime.datetime(2026, 1, 1, tzinfo=datetime.UTC)
    future = now + datetime.timedelta(days=1)
    past = now - datetime.timedelta(days=1)
    assert pat.status_of(SimpleNamespace(revoked_at=None, expires_at=future), now) == "active"
    assert pat.status_of(SimpleNamespace(revoked_at=None, expires_at=past), now) == "expired"
    assert pat.status_of(SimpleNamespace(revoked_at=past, expires_at=future), now) == "revoked"
