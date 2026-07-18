"""Streaming chat orchestration: context assembly, live token streaming with
inline tool calls (reasoning shown as <think>), persistence, and background
follow-ups (memory extraction, title generation) enqueued to Celery."""
import json
import logging
import time
from collections.abc import AsyncGenerator

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from genai import repositories as repo
from genai.core.config import settings
from genai.domain.models import User
from genai.domain.schemas import ChatIn
from genai.services import rag, tools
from genai.services.llm import build_messages, stream_llm
from genai.services.memory import recall as recall_memories

logger = logging.getLogger(__name__)


def _clamp(v, lo, hi):
    try:
        return min(hi, max(lo, v)) if v is not None else None
    except (TypeError, ValueError):
        return None


async def _resolve_context(db, user: User, session, payload: ChatIn):
    project_id = session.project_id if session else None
    if payload.regenerate and payload.parent_message_id:
        hist = await repo.history_before(db, session.id, payload.parent_message_id)
    else:
        hist = await repo.active_messages(db, session.id) if session else []
    history = [{"role": m["role"], "content": m["content"]} for m in hist]

    system_prompt = payload.system_prompt or (session.system_prompt if session else None)
    if not system_prompt and project_id:
        proj = await repo.get_project(db, user.id, project_id)
        system_prompt = proj.system_prompt if proj else None

    # Global custom instructions / "about me" always apply on top.
    persona = "\n\n".join(p for p in (
        (user.custom_instructions or "").strip(),
        (f"About the user: {user.custom_about.strip()}" if (user.custom_about or "").strip() else ""),
    ) if p)
    if persona:
        system_prompt = f"{system_prompt or settings.default_system_prompt}\n\n{persona}"

    if payload.use_rag and rag_available():
        block = await rag.context_block(db, user.id, payload.message, project_id)
        if block:
            system_prompt = f"{system_prompt or settings.default_system_prompt}\n\n{block}"

    memories = await recall_memories(db, user.id, payload.message, project_id) if payload.use_memory else None
    return {"history": history, "project_id": project_id, "system_prompt": system_prompt,
            "memories": memories or None, "is_first": not history}


def rag_available() -> bool:
    from genai.services import embeddings
    return embeddings.available()


async def stream_chat(db: AsyncSession, user: User, payload: ChatIn) -> AsyncGenerator[dict, None]:
    """Yields event dicts: {start}, {token}, {tool}, {notice}, {error}, {done}."""
    message = payload.message.strip()

    # Resolve / create session
    session = None
    if payload.session_id:
        session = await repo.get_session(db, user.id, payload.session_id)
    if session is None and payload.save:
        session = await repo.create_session(db, user.id, title=message[:60] or "New Chat", model=payload.model)

    # Per-conversation settings: payload wins, else the session's saved defaults.
    def _pref(p, s):
        return p if p is not None else (s if session else None)
    effective_model = payload.model or (session.model if session else None) or settings.LLAMA_MODEL
    temperature = _clamp(_pref(payload.temperature, session.temperature if session else None),
                         settings.MIN_TEMPERATURE, settings.MAX_TEMPERATURE)
    max_tokens = _clamp(_pref(payload.max_tokens, session.max_tokens if session else None), 1, settings.MAX_MAX_TOKENS)
    response_format = payload.response_format or (session.response_format if session else None)

    ctx = await _resolve_context(db, user, session, payload)
    messages = build_messages(ctx["history"], message, ctx["system_prompt"],
                              images=payload.images, memories=ctx["memories"])
    is_first = ctx["is_first"]

    # Persist the user turn (or reuse parent on regenerate)
    parent_id = None
    if session and payload.save:
        if payload.regenerate and payload.parent_message_id:
            parent_id = int(payload.parent_message_id)
        else:
            if is_first:
                await repo.update_session(db, session, title=message[:60], model=payload.model)
            um = await repo.add_message(db, session.id, "user", message, images=payload.images)
            parent_id = um.id
    user_msg_id = parent_id if not payload.regenerate else None

    yield {"start": True, "user_message_id": user_msg_id, "model": effective_model,
           "session_id": str(session.id) if session else None}

    tools_on = settings.TOOLS_ENABLED and payload.use_tools and not payload.images
    has_docs = await repo.has_documents(db, user.id, ctx["project_id"]) if tools_on else False
    tool_specs = tools.specs_for(has_docs) if tools_on else None

    accumulated: list[str] = []
    final_usage: dict = {}
    in_think = False
    errored = False
    convo = list(messages)
    t0 = time.monotonic()

    try:
        max_steps = settings.TOOLS_MAX_STEPS if tools_on else 0
        for step in range(max_steps + 1):
            step_tools = tool_specs if (tools_on and step < max_steps) else None
            tool_accum: dict = {}
            step_content: list[str] = []

            async for chunk in stream_llm(convo, model=effective_model, temperature=temperature,
                                          max_tokens=max_tokens, tools=step_tools,
                                          response_format=response_format):
                choices = chunk.get("choices") or []
                if choices:
                    delta = choices[0].get("delta") or {}
                    for tc in (delta.get("tool_calls") or []):
                        acc = tool_accum.setdefault(tc.get("index", 0), {"id": "", "name": "", "arguments": ""})
                        if tc.get("id"):
                            acc["id"] = tc["id"]
                        fn = tc.get("function") or {}
                        if fn.get("name"):
                            acc["name"] = fn["name"]
                        if fn.get("arguments"):
                            acc["arguments"] += fn["arguments"]
                    reasoning = delta.get("reasoning_content")
                    content = delta.get("content")
                    if reasoning:
                        if not in_think:
                            in_think = True
                            accumulated.append("<think>")
                            yield {"token": "<think>"}
                        accumulated.append(reasoning)
                        yield {"token": reasoning}
                    if content:
                        if in_think:
                            in_think = False
                            accumulated.append("</think>\n\n")
                            yield {"token": "</think>\n\n"}
                        step_content.append(content)
                        accumulated.append(content)
                        yield {"token": content}
                if chunk.get("usage"):
                    final_usage = chunk["usage"]

            if not tool_accum:
                break
            if in_think:
                in_think = False
                accumulated.append("</think>\n\n")
                yield {"token": "</think>\n\n"}

            ordered = [tool_accum[k] for k in sorted(tool_accum)]
            convo.append({"role": "assistant", "content": "".join(step_content),
                          "tool_calls": [{"id": a["id"] or a["name"], "type": "function",
                                          "function": {"name": a["name"], "arguments": a["arguments"] or "{}"}}
                                         for a in ordered]})
            for a in ordered:
                try:
                    args = json.loads(a["arguments"] or "{}")
                except json.JSONDecodeError:
                    args = {}
                output = await tools.execute_tool(db, user.id, a["name"], args, ctx["project_id"])
                yield {"tool": {"name": a["name"], "arguments": args, "result": output}}
                convo.append({"role": "tool", "tool_call_id": a["id"] or a["name"],
                              "name": a["name"], "content": output[:4000]})

        if in_think:
            accumulated.append("</think>")
            yield {"token": "</think>"}
    except (httpx.HTTPError, httpx.StreamError) as e:
        errored = True
        logger.exception("Stream generation failed")
        yield {"error": "The model is unavailable. Please try again."}
        _ = e

    # Persist assistant message + enqueue follow-ups
    asst_id = None
    if session and payload.save and accumulated:
        asst = await repo.add_message(db, session.id, "assistant", "".join(accumulated),
                                      token_usage=final_usage or None, complete=not errored,
                                      model=effective_model, parent_id=parent_id,
                                      latency_ms=int((time.monotonic() - t0) * 1000))
        asst_id = asst.id
        if not errored:
            _enqueue_followups(user.id, session.id, message, is_first, ctx["project_id"], payload)

    yield {"done": True, "usage": final_usage, "message_id": asst_id,
           "is_first": is_first, "model": effective_model}


def _enqueue_followups(user_id, session_id, message, is_first, project_id, payload: ChatIn):
    """Fire background Celery tasks (memory extraction + auto-title). Degrades to
    a no-op if the broker is unreachable, so chat never fails on this."""
    try:
        from genai.tasks import extract_memory_task, generate_title_task
        if payload.use_memory and settings.MEMORY_ENABLED:
            extract_memory_task.delay(str(user_id), str(session_id), message, project_id)
        if is_first:
            generate_title_task.delay(str(user_id), str(session_id), message)
    except Exception:
        logger.debug("Could not enqueue follow-up tasks", exc_info=True)
