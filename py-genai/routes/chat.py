import json
import logging

from flask import Blueprint, Response, jsonify, request, stream_with_context

from extensions import limiter
from services.history import add_message, get_messages, get_session, update_session
from services.llm import build_messages, call_llm, stream_llm

logger = logging.getLogger(__name__)
chat_bp = Blueprint("chat", __name__)


def _validate(data: dict) -> tuple[bool, str]:
    msg = data.get("message", "")
    if not isinstance(msg, str) or not msg.strip():
        return False, "Message is required"
    if len(msg) > 4000:
        return False, "Message too long (max 4000 characters)"
    return True, msg.strip()


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


def _float_param(val) -> float | None:
    try:
        return float(val) if val is not None else None
    except (ValueError, TypeError):
        return None


def _int_param(val) -> int | None:
    try:
        return int(val) if val is not None else None
    except (ValueError, TypeError):
        return None


@chat_bp.route("/api/chat", methods=["POST"])
@limiter.limit("10 per minute")
def chat():
    data = request.get_json(silent=True) or {}
    valid, result = _validate(data)
    if not valid:
        return jsonify({"error": result}), 400

    message = result
    session_id = data.get("session_id")
    model = data.get("model") or None
    temperature = _float_param(data.get("temperature"))
    max_tokens = _int_param(data.get("max_tokens"))
    history, stored_prompt = _session_context(session_id)
    system_prompt = data.get("system_prompt") or stored_prompt
    messages = build_messages(history, message, system_prompt)

    try:
        content, usage = call_llm(messages, model=model, temperature=temperature, max_tokens=max_tokens)
        asst_msg_id = None
        if session_id:
            if not history:
                update_session(session_id, title=message[:60], model=model)
            add_message(session_id, "user", message)
            asst_msg_id = add_message(session_id, "assistant", content, token_usage=usage)
        return jsonify({"response": content, "usage": usage, "message_id": asst_msg_id})
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
    session_id = data.get("session_id")
    model = data.get("model") or None
    temperature = _float_param(data.get("temperature"))
    max_tokens = _int_param(data.get("max_tokens"))
    history, stored_prompt = _session_context(session_id)
    system_prompt = data.get("system_prompt") or stored_prompt
    messages = build_messages(history, message, system_prompt)
    is_first = not history

    user_msg_id = None
    if session_id:
        if is_first:
            update_session(session_id, title=message[:60], model=model)
        user_msg_id = add_message(session_id, "user", message)

    def generate():
        accumulated: list[str] = []
        final_usage: dict = {}
        yield f"data: {json.dumps({'start': True, 'user_message_id': user_msg_id})}\n\n"
        try:
            for chunk in stream_llm(messages, model=model, temperature=temperature, max_tokens=max_tokens):
                choices = chunk.get("choices") or []
                if choices:
                    token = (choices[0].get("delta") or {}).get("content", "")
                    if token:
                        accumulated.append(token)
                        yield f"data: {json.dumps({'token': token})}\n\n"
                if chunk.get("usage"):
                    final_usage = chunk["usage"]
        except GeneratorExit:
            pass
        except Exception:
            logger.exception("Stream generation failed")
            yield f"data: {json.dumps({'error': 'The model is unavailable. Please try again.'})}\n\n"
        finally:
            asst_msg_id = None
            if session_id and accumulated:
                asst_msg_id = add_message(
                    session_id, "assistant", "".join(accumulated),
                    token_usage=final_usage or None,
                )
            yield f"data: {json.dumps({'done': True, 'usage': final_usage, 'message_id': asst_msg_id, 'is_first': is_first})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
