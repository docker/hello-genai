import json

import requests

from config import Config


def build_messages(history: list, user_message: str, system_prompt: str | None = None) -> list:
    messages = [{"role": "system", "content": system_prompt or Config.DEFAULT_SYSTEM_PROMPT}]
    messages.extend({"role": m["role"], "content": m["content"]} for m in history)
    messages.append({"role": "user", "content": user_message})
    return messages


def call_llm(messages: list, model: str | None = None) -> tuple[str, dict]:
    resp = requests.post(
        f"{Config.MODEL_URL}/chat/completions",
        json={"model": model or Config.MODEL_NAME, "messages": messages},
        headers={"Content-Type": "application/json"},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"].strip()
    return content, data.get("usage", {})


def stream_llm(messages: list, model: str | None = None):
    """Yields SSE-parsed chunks. Falls back to a single chunk if the server returns plain JSON."""
    resp = requests.post(
        f"{Config.MODEL_URL}/chat/completions",
        json={"model": model or Config.MODEL_NAME, "messages": messages, "stream": True},
        headers={"Content-Type": "application/json"},
        stream=True,
        timeout=60,
    )
    resp.raise_for_status()

    # DMR may not support SSE — detect via Content-Type and fall back gracefully
    if "event-stream" not in resp.headers.get("Content-Type", ""):
        data = resp.json()
        content = data["choices"][0]["message"]["content"].strip()
        yield {"choices": [{"delta": {"content": content}}], "usage": data.get("usage", {})}
        return

    for raw_line in resp.iter_lines():
        if not raw_line:
            continue
        line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
        if not line.startswith("data: "):
            continue
        payload = line[6:]
        if payload == "[DONE]":
            return
        yield json.loads(payload)
