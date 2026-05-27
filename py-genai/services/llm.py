import json
import logging

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from config import Config

logger = logging.getLogger(__name__)


def _session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=Config.LLM_MAX_RETRIES,
        backoff_factor=0.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["POST"],
    )
    s.mount("http://", HTTPAdapter(max_retries=retry))
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s


def build_messages(history: list, user_message: str, system_prompt: str | None = None) -> list:
    messages = [{"role": "system", "content": system_prompt or Config.DEFAULT_SYSTEM_PROMPT}]
    messages.extend({"role": m["role"], "content": m["content"]} for m in history)
    messages.append({"role": "user", "content": user_message})
    return messages


def call_llm(
    messages: list,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> tuple[str, dict]:
    payload: dict = {"model": model or Config.MODEL_NAME, "messages": messages}
    if temperature is not None:
        payload["temperature"] = temperature
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    with _session() as s:
        resp = s.post(
            f"{Config.MODEL_URL}/chat/completions",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=Config.LLM_TIMEOUT,
        )
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"].strip()
    return content, data.get("usage", {})


def stream_llm(
    messages: list,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
):
    """Yields SSE-parsed chunks. Falls back to a single chunk if the server returns plain JSON."""
    payload: dict = {"model": model or Config.MODEL_NAME, "messages": messages, "stream": True}
    if temperature is not None:
        payload["temperature"] = temperature
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    s = _session()
    resp = s.post(
        f"{Config.MODEL_URL}/chat/completions",
        json=payload,
        headers={"Content-Type": "application/json"},
        stream=True,
        timeout=Config.LLM_TIMEOUT,
    )
    resp.raise_for_status()

    # DMR may not support SSE — detect via Content-Type and fall back gracefully
    if "event-stream" not in resp.headers.get("Content-Type", ""):
        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()
        yield {"choices": [{"delta": {"content": content}}], "usage": data.get("usage", {})}
        s.close()
        return

    try:
        for raw_line in resp.iter_lines():
            if not raw_line:
                continue
            line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
            if not line.startswith("data: "):
                continue
            payload = line[6:]
            if payload == "[DONE]":
                return
            try:
                yield json.loads(payload)
            except json.JSONDecodeError:
                logger.warning("Malformed SSE chunk (skipped): %s", payload[:120])
    finally:
        s.close()
