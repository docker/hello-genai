"""Unit tests for route-level input validation helpers."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("LLAMA_URL", "http://localhost:1")
os.environ.setdefault("LLAMA_MODEL", "test-model")

from config import Config
from routes.chat import _validate

MAX = Config.MAX_MESSAGE_LEN


@pytest.mark.parametrize("data,ok,fragment", [
    ({"message": "hello"},          True,  "hello"),
    ({"message": "  trimmed  "},    True,  "trimmed"),
    ({},                            False, "required"),
    ({"message": ""},               False, "required"),
    ({"message": "   "},            False, "required"),
    ({"message": 123},              False, "required"),
    ({"message": "x" * (MAX + 1)}, False, "too long"),
    ({"message": "x" * MAX},       True,  "x" * MAX),
])
def test_validate(data, ok, fragment):
    valid, result = _validate(data)
    assert valid is ok
    assert fragment in result
