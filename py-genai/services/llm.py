import json
import logging
import re

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from config import Config

logger = logging.getLogger(__name__)

_SESSION: requests.Session | None = None


def _session() -> requests.Session:
    """Lazily built, shared HTTP session with a connection pool and retry policy.
    Reused across calls to avoid per-request connection setup overhead."""
    global _SESSION
    if _SESSION is None:
        s = requests.Session()
        retry = Retry(
            total=Config.LLM_MAX_RETRIES,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["POST"],
        )
        adapter = HTTPAdapter(max_retries=retry)
        s.mount("http://", adapter)
        s.mount("https://", adapter)
        _SESSION = s
    return _SESSION


def _estimate_tokens(text: str) -> int:
    # ~4 characters per token is a reasonable approximation for English text
    return len(text) // 4 + 1


def strip_think(text: str) -> str:
    """Remove <think>…</think> reasoning blocks (reasoning models emit them);
    used when the raw answer is consumed programmatically (titles, memory)."""
    return re.sub(r"<think>.*?(</think>|$)", "", text, flags=re.S).strip()


def build_messages(
    history: list,
    user_message: str,
    system_prompt: str | None = None,
    images: list[str] | None = None,
    memories: list[str] | None = None,
) -> list:
    system = system_prompt or Config.DEFAULT_SYSTEM_PROMPT

    # Persistent memory: durable facts about the user, recalled every conversation
    if memories:
        facts = "\n".join(f"- {m}" for m in memories)
        system = (
            f"{system}\n\n"
            "You have persistent memory across conversations. "
            "Facts you remember about the user:\n"
            f"{facts}\n"
            "Use these naturally when relevant. Do not mention the memory system unless the user asks about it."
        )

    # If the trailing history entry is the same user message (already persisted
    # by a concurrent request, e.g. compare mode), drop it to avoid a double turn.
    if history and history[-1]["role"] == "user" and history[-1]["content"] == user_message:
        history = history[:-1]

    # Trim oldest turns first so the conversation fits the context budget.
    # The system prompt and the new user message are always kept.
    budget = Config.LLM_CONTEXT_MAX_TOKENS - _estimate_tokens(system) - _estimate_tokens(user_message)
    kept: list = []
    for m in reversed(history):
        cost = _estimate_tokens(m["content"])
        if cost > budget:
            break
        budget -= cost
        kept.append({"role": m["role"], "content": m["content"]})
    if len(kept) < len(history):
        logger.info("Context trimmed: keeping %d of %d history messages", len(kept), len(history))
    kept.reverse()

    messages = [{"role": "system", "content": system}]
    messages.extend(kept)

    # Vision models accept an OpenAI-style multimodal content array
    if images:
        content: list = [{"type": "text", "text": user_message}]
        content += [{"type": "image_url", "image_url": {"url": u}} for u in images]
        messages.append({"role": "user", "content": content})
    else:
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
    resp = _session().post(
        f"{Config.MODEL_URL}/chat/completions",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=Config.LLM_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    msg = data["choices"][0]["message"]
    content = (msg.get("content") or "").strip()
    reasoning = (msg.get("reasoning_content") or "").strip()
    # Reasoning models return chain-of-thought separately; wrap it in <think> so
    # the UI shows it as a collapsible section instead of dropping it.
    if reasoning:
        content = f"<think>{reasoning}</think>\n\n{content}".strip()
    return content, data.get("usage", {})


def stream_llm(
    messages: list,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
):
    """Yields SSE-parsed chunks. Falls back to a single chunk if the server returns plain JSON."""
    payload: dict = {
        "model": model or Config.MODEL_NAME,
        "messages": messages,
        "stream": True,
        # Ask the backend to include token usage in the final stream chunk;
        # most OpenAI-compatible servers omit it otherwise.
        "stream_options": {"include_usage": True},
    }
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
    if resp.status_code == 400:
        # Some backends reject stream_options — retry once without it
        payload.pop("stream_options", None)
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
        resp.close()
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
        # Release the response back to the shared pool without closing the session
        resp.close()
