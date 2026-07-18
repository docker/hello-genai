import json
import logging
import time

import requests
from flask import Blueprint, Response, jsonify, request, stream_with_context

from config import Config
from extensions import limiter
from services import rag, tools
from services.history import (
    add_message,
    get_history_before,
    get_messages,
    get_session,
    list_documents,
    update_session,
)
from services.llm import build_messages, call_llm, stream_llm
from services.memory import recall as recall_memories
from services.memory import remember_async

logger = logging.getLogger(__name__)
chat_bp = Blueprint("chat", __name__)


def _validate(data: dict) -> tuple[bool, str]:
    msg = data.get("message", "")
    if not isinstance(msg, str) or not msg.strip():
        return False, "Message is required"
    if len(msg) > Config.MAX_MESSAGE_LEN:
        return False, f"Message too long (max {Config.MAX_MESSAGE_LEN} characters)"
    return True, msg.strip()


def _valid_images(data: dict) -> list[str]:
    images = data.get("images")
    if not isinstance(images, list):
        return []
    out: list[str] = []
    for img in images[:Config.MAX_IMAGES_PER_MESSAGE]:
        if not isinstance(img, str) or not img.startswith("data:image/"):
            continue
        if len(img) > Config.MAX_IMAGE_BYTES * 4 // 3 + 256:
            continue
        out.append(img)
    return out


def _float_param(val, lo: float, hi: float) -> float | None:
    try:
        return min(hi, max(lo, float(val))) if val is not None else None
    except (ValueError, TypeError):
        return None


def _int_param(val, lo: int, hi: int) -> int | None:
    try:
        return min(hi, max(lo, int(val))) if val is not None else None
    except (ValueError, TypeError):
        return None


def _parse_request(data: dict) -> dict:
    return {
        "session_id": data.get("session_id"),
        "model": data.get("model") or None,
        "temperature": _float_param(data.get("temperature"), Config.MIN_TEMPERATURE, Config.MAX_TEMPERATURE),
        "max_tokens": _int_param(data.get("max_tokens"), Config.MIN_MAX_TOKENS, Config.MAX_MAX_TOKENS),
        "save": data.get("save") is not False,
        "images": _valid_images(data),
        "use_memory": Config.MEMORY_ENABLED and data.get("use_memory") is not False,
        "use_tools": Config.TOOLS_ENABLED and data.get("use_tools") is not False,
        "use_rag": data.get("use_rag") is not False,
        "regenerate": bool(data.get("regenerate")),
        "parent_message_id": data.get("parent_message_id"),
        "system_prompt": data.get("system_prompt") or None,
    }


def _resolve_context(p: dict, message: str) -> dict:
    """Assemble history, project scope, system prompt (with RAG), and memories."""
    session_id = p["session_id"]
    session = get_session(session_id) if session_id else None
    project_id = session.get("project_id") if session else None

    if p["regenerate"] and session_id and p["parent_message_id"]:
        history_msgs = get_history_before(session_id, int(p["parent_message_id"]))
    else:
        history_msgs = get_messages(session_id) if session_id else []
    history = [{"role": m["role"], "content": m["content"]} for m in history_msgs]

    system_prompt = p["system_prompt"] or (session.get("system_prompt") if session else None)
    # Fall back to the project's system prompt when the session has none
    if not system_prompt and project_id:
        from services.history import get_project
        proj = get_project(project_id)
        system_prompt = proj.get("system_prompt") if proj else None

    # RAG: ground the answer in relevant document passages (project-scoped)
    if p["use_rag"] and rag_available():
        block = rag.context_block(message, project_id=project_id)
        if block:
            system_prompt = f"{system_prompt or Config.DEFAULT_SYSTEM_PROMPT}\n\n{block}"

    memories = recall_memories(message, project_id=project_id) if p["use_memory"] else None
    return {
        "history": history,
        "project_id": project_id,
        "system_prompt": system_prompt,
        "memories": memories or None,
        "is_first": not history,
    }


def rag_available() -> bool:
    from services import embeddings
    return embeddings.available()


@chat_bp.route("/api/chat", methods=["POST"])
@limiter.limit("10 per minute")
def chat():
    data = request.get_json(silent=True) or {}
    valid, result = _validate(data)
    if not valid:
        return jsonify({"error": result}), 400

    message = result
    p = _parse_request(data)
    session_id = p["session_id"]
    effective_model = p["model"] or Config.MODEL_NAME
    ctx = _resolve_context(p, message)
    messages = build_messages(ctx["history"], message, ctx["system_prompt"],
                              images=p["images"], memories=ctx["memories"])

    try:
        content, usage = call_llm(messages, model=p["model"], temperature=p["temperature"], max_tokens=p["max_tokens"])
        asst_msg_id = None
        if session_id and p["save"]:
            parent_id = _persist_user_turn(p, session_id, message, ctx["is_first"])
            asst_msg_id = add_message(session_id, "assistant", content, token_usage=usage,
                                      model=effective_model, parent_id=parent_id)
            if p["use_memory"]:
                remember_async(message, session_id, ctx["project_id"])
        return jsonify({"response": content, "usage": usage, "message_id": asst_msg_id, "model": effective_model})
    except Exception:
        logger.exception("LLM call failed")
        return jsonify({"error": "The model is unavailable. Please try again."}), 500


def _persist_user_turn(p: dict, session_id: str, message: str, is_first: bool) -> int | None:
    """Persist (or reuse, on regenerate) the user message; return the parent id
    the assistant response should branch under."""
    if p["regenerate"] and p["parent_message_id"]:
        return int(p["parent_message_id"])
    if is_first:
        update_session(session_id, title=message[:60], model=p["model"])
    return add_message(session_id, "user", message)


@chat_bp.route("/api/stream", methods=["POST"])
@limiter.limit("10 per minute")
def stream():
    data = request.get_json(silent=True) or {}
    valid, result = _validate(data)
    if not valid:
        return jsonify({"error": result}), 400

    message = result
    p = _parse_request(data)
    session_id = p["session_id"]
    save = p["save"]
    effective_model = p["model"] or Config.MODEL_NAME
    ctx = _resolve_context(p, message)
    messages = build_messages(ctx["history"], message, ctx["system_prompt"],
                              images=p["images"], memories=ctx["memories"])
    is_first = ctx["is_first"]

    parent_id = None
    if session_id and save:
        parent_id = _persist_user_turn(p, session_id, message, is_first)
    user_msg_id = parent_id if not p["regenerate"] else None

    # Tools only when enabled and no images (vision + tools is unreliable)
    tools_on = p["use_tools"] and not p["images"]
    has_docs = bool(list_documents(ctx["project_id"])) if tools_on else False
    tool_specs = tools.specs_for(ctx["project_id"], has_docs) if tools_on else None

    def _stream_step(convo, step_tools):
        """Stream one model turn, retrying the connection before the first token."""
        attempts = Config.LLM_MAX_RETRIES + 1
        for attempt in range(attempts):
            started = False
            try:
                for chunk in stream_llm(convo, model=p["model"], temperature=p["temperature"],
                                        max_tokens=p["max_tokens"], tools=step_tools):
                    started = True
                    yield chunk
                return
            except (requests.ConnectionError, requests.Timeout) as e:
                if started or attempt == attempts - 1:
                    raise
                logger.info("Stream connect failed (%s); reconnecting (%d/%d)", e, attempt + 1, attempts - 1)
                yield {"_notice": "Reconnecting to the model…"}
                time.sleep(0.5 * (attempt + 1))

    def generate():
        accumulated: list[str] = []
        final_usage: dict = {}
        interrupted = False
        errored = False
        in_think = False
        convo = list(messages)
        yield f"data: {json.dumps({'start': True, 'user_message_id': user_msg_id, 'model': effective_model})}\n\n"

        def _emit(tok: str) -> str:
            accumulated.append(tok)
            return f"data: {json.dumps({'token': tok})}\n\n"

        try:
            # Live agentic loop: stream reasoning + content as they arrive, and
            # handle any tool-call the model streams inline, then continue.
            max_steps = Config.TOOLS_MAX_STEPS if tools_on else 0
            for step in range(max_steps + 1):
                step_tools = tool_specs if (tools_on and step < max_steps) else None
                tool_accum: dict = {}
                step_content: list[str] = []

                for chunk in _stream_step(convo, step_tools):
                    if chunk.get("_notice"):
                        yield f"data: {json.dumps({'notice': chunk['_notice']})}\n\n"
                        continue
                    choices = chunk.get("choices") or []
                    if choices:
                        delta = choices[0].get("delta") or {}
                        # Tool-call deltas arrive in fragments — accumulate by index
                        for tc in (delta.get("tool_calls") or []):
                            acc = tool_accum.setdefault(tc.get("index", 0), {"id": "", "name": "", "arguments": ""})
                            if tc.get("id"):
                                acc["id"] = tc["id"]
                            fn = tc.get("function") or {}
                            if fn.get("name"):
                                acc["name"] = fn["name"]
                            if fn.get("arguments"):
                                acc["arguments"] += fn["arguments"]
                        # Stream reasoning (wrapped in <think>) and content live
                        reasoning = delta.get("reasoning_content")
                        content = delta.get("content")
                        if reasoning:
                            if not in_think:
                                in_think = True
                                yield _emit("<think>")
                            yield _emit(reasoning)
                        if content:
                            if in_think:
                                in_think = False
                                yield _emit("</think>\n\n")
                            step_content.append(content)
                            yield _emit(content)
                    if chunk.get("usage"):
                        final_usage = chunk["usage"]

                if not tool_accum:
                    break  # model answered normally — done

                # Close any open reasoning block before showing tool activity
                if in_think:
                    in_think = False
                    yield _emit("</think>\n\n")

                ordered = [tool_accum[k] for k in sorted(tool_accum)]
                convo.append({
                    "role": "assistant",
                    "content": "".join(step_content),
                    "tool_calls": [
                        {"id": a["id"] or a["name"], "type": "function",
                         "function": {"name": a["name"], "arguments": a["arguments"] or "{}"}}
                        for a in ordered
                    ],
                })
                for a in ordered:
                    try:
                        args = json.loads(a["arguments"] or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    output = tools.execute_tool(a["name"], args, ctx["project_id"])
                    yield f"data: {json.dumps({'tool': {'name': a['name'], 'arguments': args, 'result': output}})}\n\n"
                    convo.append({"role": "tool", "tool_call_id": a["id"] or a["name"],
                                  "name": a["name"], "content": output[:4000]})

            if in_think:
                yield _emit("</think>")
        except GeneratorExit:
            interrupted = True
        except Exception:
            errored = True
            logger.exception("Stream generation failed")
            yield f"data: {json.dumps({'error': 'The model is unavailable. Please try again.'})}\n\n"
        finally:
            asst_msg_id = None
            if session_id and save and accumulated:
                asst_msg_id = add_message(
                    session_id, "assistant", "".join(accumulated),
                    token_usage=final_usage or None,
                    complete=not (interrupted or errored),
                    model=effective_model, parent_id=parent_id,
                )
                if p["use_memory"] and not errored:
                    remember_async(message, session_id, ctx["project_id"])
            if not interrupted:
                yield (
                    "data: "
                    + json.dumps({
                        "done": True, "usage": final_usage, "message_id": asst_msg_id,
                        "is_first": is_first, "model": effective_model,
                    })
                    + "\n\n"
                )

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
