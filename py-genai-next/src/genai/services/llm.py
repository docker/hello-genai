"""Async LLM client (OpenAI-compatible), context assembly, and streaming."""
import asyncio
import json
import logging
import re
from collections.abc import AsyncGenerator

import httpx

from genai.core.config import settings

logger = logging.getLogger(__name__)

# httpx binds pooled connections to the event loop they were opened on. The API
# runs one long-lived loop, but Celery drives each task through its own
# asyncio.run() loop that is created and destroyed per task. Sharing a single
# client across those loops raises "Event loop is closed" when the pool reaps a
# connection tied to a dead loop. So we keep one client *per event loop* and
# close it on that same loop before it is torn down (see aclose / tasks._run).
_clients: dict[int, httpx.AsyncClient] = {}


def client() -> httpx.AsyncClient:
    loop = asyncio.get_running_loop()
    key = id(loop)
    c = _clients.get(key)
    if c is None or c.is_closed:
        c = httpx.AsyncClient(timeout=settings.LLM_TIMEOUT)
        _clients[key] = c
    return c


async def aclose() -> None:
    """Close the httpx client bound to the currently running loop. Safe to call
    at app shutdown and at the end of every Celery task."""
    try:
        key = id(asyncio.get_running_loop())
    except RuntimeError:
        return
    c = _clients.pop(key, None)
    if c is not None and not c.is_closed:
        await c.aclose()


def _estimate_tokens(text: str) -> int:
    return len(text) // 4 + 1


def strip_think(text: str) -> str:
    return re.sub(r"<think>.*?(</think>|$)", "", text, flags=re.S).strip()


def build_messages(history, user_message, system_prompt=None, images=None, memories=None):
    system = system_prompt or settings.default_system_prompt
    if memories:
        facts = "\n".join(f"- {m}" for m in memories)
        system = (
            f"{system}\n\nYou have persistent memory across conversations. "
            f"Facts you remember about the user:\n{facts}\n"
            "Use these naturally when relevant. Do not mention the memory system unless asked."
        )

    if history and history[-1]["role"] == "user" and history[-1]["content"] == user_message:
        history = history[:-1]

    budget = settings.LLM_CONTEXT_MAX_TOKENS - _estimate_tokens(system) - _estimate_tokens(user_message)
    kept = []
    for m in reversed(history):
        cost = _estimate_tokens(m["content"])
        if cost > budget:
            break
        budget -= cost
        kept.append({"role": m["role"], "content": m["content"]})
    kept.reverse()

    messages = [{"role": "system", "content": system}]
    messages.extend(kept)
    if images:
        content: list = [{"type": "text", "text": user_message}]
        content += [{"type": "image_url", "image_url": {"url": u}} for u in images]
        messages.append({"role": "user", "content": content})
    else:
        messages.append({"role": "user", "content": user_message})
    return messages


async def call_llm_raw(messages, model=None, temperature=None, max_tokens=None, tools=None) -> dict:
    payload: dict = {"model": model or settings.LLAMA_MODEL, "messages": messages}
    if temperature is not None:
        payload["temperature"] = temperature
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    if tools:
        payload["tools"] = tools
    resp = await client().post(f"{settings.LLAMA_URL}/chat/completions", json=payload)
    resp.raise_for_status()
    data = resp.json()
    return {"message": data["choices"][0]["message"], "usage": data.get("usage", {})}


async def call_llm(messages, model=None, temperature=None, max_tokens=None) -> tuple[str, dict]:
    result = await call_llm_raw(messages, model=model, temperature=temperature, max_tokens=max_tokens)
    msg = result["message"]
    content = (msg.get("content") or "").strip()
    reasoning = (msg.get("reasoning_content") or "").strip()
    if reasoning:
        content = f"<think>{reasoning}</think>\n\n{content}".strip()
    return content, result["usage"]


async def stream_llm(messages, model=None, temperature=None, max_tokens=None, tools=None,
                     response_format=None) -> AsyncGenerator[dict, None]:
    payload: dict = {
        "model": model or settings.LLAMA_MODEL,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if temperature is not None:
        payload["temperature"] = temperature
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    if tools:
        payload["tools"] = tools
    if response_format == "json":
        payload["response_format"] = {"type": "json_object"}

    url = f"{settings.LLAMA_URL}/chat/completions"
    async with client().stream("POST", url, json=payload) as resp:
        if resp.status_code == 400:
            await resp.aread()
            payload.pop("stream_options", None)
            payload.pop("tools", None)
            async with client().stream("POST", url, json=payload) as resp2:
                resp2.raise_for_status()
                async for chunk in _iter_sse(resp2):
                    yield chunk
            return
        resp.raise_for_status()
        async for chunk in _iter_sse(resp):
            yield chunk


async def _iter_sse(resp: httpx.Response) -> AsyncGenerator[dict, None]:
    async for line in resp.aiter_lines():
        if not line or not line.startswith("data: "):
            continue
        payload = line[6:]
        if payload == "[DONE]":
            return
        try:
            yield json.loads(payload)
        except json.JSONDecodeError:
            logger.warning("Malformed SSE chunk skipped: %s", payload[:120])
