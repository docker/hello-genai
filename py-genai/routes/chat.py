import json
import logging
import time

import requests
from flask import Blueprint, Response, jsonify, request, stream_with_context

from config import Config
from extensions import limiter
from services.history import add_message, get_messages, get_session, list_memories, update_session
from services.llm import build_messages, call_llm, stream_llm
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
    """Extract and bound-check inline image data URLs for vision models."""
    images = data.get("images")
    if not isinstance(images, list):
        return []
    out: list[str] = []
    for img in images[:Config.MAX_IMAGES_PER_MESSAGE]:
        if not isinstance(img, str) or not img.startswith("data:image/"):
            continue
        # base64 payload is ~4/3 of the raw byte size
        if len(img) > Config.MAX_IMAGE_BYTES * 4 // 3 + 256:
            continue
        out.append(img)
    return out


def _session_context(session_id: str | None) -> tuple[list, str | None]:
    if not session_id:
        return [], None
    session = get_session(session_id)
    if not session:
        return [], None
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in get_messages(session_id)
    ]
    return history, session.get("system_prompt")


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
        # save=false runs the request with session context but persists nothing —
        # used by the compare-models feature for the secondary model.
        "save": data.get("save") is not False,
        "images": _valid_images(data),
        # use_memory=false skips both memory injection and fact extraction
        "use_memory": Config.MEMORY_ENABLED and data.get("use_memory") is not False,
    }


def _recalled_memories(use_memory: bool) -> list[str] | None:
    if not use_memory:
        return None
    return [m["content"] for m in list_memories(enabled_only=True)] or None


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
    history, stored_prompt = _session_context(session_id)
    system_prompt = data.get("system_prompt") or stored_prompt
    messages = build_messages(
        history, message, system_prompt,
        images=p["images"], memories=_recalled_memories(p["use_memory"]),
    )

    try:
        content, usage = call_llm(messages, model=p["model"], temperature=p["temperature"], max_tokens=p["max_tokens"])
        asst_msg_id = None
        if session_id and p["save"]:
            if not history:
                update_session(session_id, title=message[:60], model=p["model"])
            add_message(session_id, "user", message)
            asst_msg_id = add_message(session_id, "assistant", content, token_usage=usage, model=effective_model)
            if p["use_memory"]:
                remember_async(message, session_id)
        return jsonify({"response": content, "usage": usage, "message_id": asst_msg_id, "model": effective_model})
    except Exception:
        logger.exception("LLM call failed")
        return jsonify({"error": "The model is unavailable. Please try again."}), 500


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
    history, stored_prompt = _session_context(session_id)
    system_prompt = data.get("system_prompt") or stored_prompt
    messages = build_messages(
        history, message, system_prompt,
        images=p["images"], memories=_recalled_memories(p["use_memory"]),
    )
    is_first = not history

    user_msg_id = None
    if session_id and save:
        if is_first:
            update_session(session_id, title=message[:60], model=p["model"])
        user_msg_id = add_message(session_id, "user", message)

    def _stream_with_reconnect():
        """Yield chunks, retrying the connection before the first token so a
        transient backend hiccup surfaces as a 'reconnecting' notice rather than
        a hard failure. Once tokens have started we can't safely rewind."""
        attempts = Config.LLM_MAX_RETRIES + 1
        for attempt in range(attempts):
            started = False
            try:
                for chunk in stream_llm(
                    messages, model=p["model"], temperature=p["temperature"], max_tokens=p["max_tokens"]
                ):
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
        in_think = False  # backend may stream separate reasoning_content deltas
        yield f"data: {json.dumps({'start': True, 'user_message_id': user_msg_id, 'model': effective_model})}\n\n"

        def _emit(tok: str) -> str:
            accumulated.append(tok)
            return f"data: {json.dumps({'token': tok})}\n\n"

        try:
            for chunk in _stream_with_reconnect():
                if chunk.get("_notice"):
                    yield f"data: {json.dumps({'notice': chunk['_notice']})}\n\n"
                    continue
                choices = chunk.get("choices") or []
                if choices:
                    delta = choices[0].get("delta") or {}
                    reasoning = delta.get("reasoning_content")
                    content = delta.get("content")
                    # Wrap reasoning-model chain-of-thought in <think> so the UI
                    # renders it as a collapsible section (models that use the
                    # separate reasoning_content field, e.g. DeepSeek-R1/Qwen).
                    if reasoning:
                        if not in_think:
                            in_think = True
                            yield _emit("<think>")
                        yield _emit(reasoning)
                    if content:
                        if in_think:
                            in_think = False
                            yield _emit("</think>\n\n")
                        yield _emit(content)
                if chunk.get("usage"):
                    final_usage = chunk["usage"]
            if in_think:
                in_think = False
                yield _emit("</think>")
        except GeneratorExit:
            # Client disconnected or aborted — no further yields are allowed
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
                    model=effective_model,
                )
                if p["use_memory"] and not errored:
                    remember_async(message, session_id)
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
