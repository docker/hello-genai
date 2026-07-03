import json
import logging
from concurrent.futures import ThreadPoolExecutor

from flask import Blueprint, Response, jsonify, request

from config import Config
from services.history import (
    create_preset,
    create_session,
    delete_messages_from,
    delete_preset,
    delete_session,
    get_messages,
    get_session,
    import_session,
    list_presets,
    list_sessions,
    pin_session,
    search_messages,
    set_message_feedback,
    update_session,
)
from services.llm import call_llm

logger = logging.getLogger(__name__)
sessions_bp = Blueprint("sessions", __name__)

_title_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="auto-title")


def _auto_title(session_id: str, message: str) -> None:
    def _run():
        try:
            msgs = [{
                "role": "user",
                "content": (
                    f"Write a 4-6 word title for a chat that starts with: {message[:200]}. "
                    "Reply with only the title, no quotes or punctuation."
                ),
            }]
            title, _ = call_llm(msgs)
            update_session(session_id, title=title.strip()[:Config.MAX_SESSION_TITLE_LEN])
        except Exception:
            logger.debug("Auto-title generation failed for session %s", session_id)
    _title_executor.submit(_run)


@sessions_bp.route("/api/sessions", methods=["GET"])
def get_sessions():
    return jsonify(list_sessions())


@sessions_bp.route("/api/sessions", methods=["POST"])
def new_session():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "New Chat"))[:Config.MAX_SESSION_TITLE_LEN]
    system_prompt = data.get("system_prompt")
    if system_prompt is not None:
        system_prompt = str(system_prompt)[:Config.MAX_SYSTEM_PROMPT_LEN]
    session_id = create_session(title=title, system_prompt=system_prompt)
    return jsonify({"session_id": session_id}), 201


@sessions_bp.route("/api/sessions/import", methods=["POST"])
def import_session_route():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "Imported Chat"))[:Config.MAX_SESSION_TITLE_LEN]
    system_prompt = data.get("system_prompt")
    messages = data.get("messages", [])
    if system_prompt is not None:
        system_prompt = str(system_prompt)[:Config.MAX_SYSTEM_PROMPT_LEN]
    if not isinstance(messages, list):
        return jsonify({"error": "messages must be an array"}), 400
    session_id = import_session(title=title, messages=messages, system_prompt=system_prompt)
    return jsonify({"session_id": session_id}), 201


@sessions_bp.route("/api/sessions/<session_id>", methods=["PATCH"])
def patch_session(session_id: str):
    data = request.get_json(silent=True) or {}
    title = data.get("title")
    system_prompt = data.get("system_prompt")
    model = data.get("model")
    if title is not None:
        title = str(title)[:Config.MAX_SESSION_TITLE_LEN]
    if system_prompt is not None:
        system_prompt = str(system_prompt)[:Config.MAX_SYSTEM_PROMPT_LEN]
    if model is not None:
        model = str(model)
    update_session(session_id, title=title, system_prompt=system_prompt, model=model)
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    return jsonify(session)


@sessions_bp.route("/api/sessions/<session_id>/pin", methods=["POST"])
def toggle_pin(session_id: str):
    data = request.get_json(silent=True) or {}
    pin_session(session_id, pinned=bool(data.get("pinned", True)))
    return jsonify({"ok": True})


@sessions_bp.route("/api/sessions/<session_id>", methods=["DELETE"])
def remove_session(session_id: str):
    delete_session(session_id)
    return jsonify({"ok": True})


@sessions_bp.route("/api/sessions/<session_id>/messages", methods=["GET"])
def get_session_messages(session_id: str):
    return jsonify(get_messages(session_id))


@sessions_bp.route("/api/sessions/<session_id>/messages/from/<int:message_id>", methods=["DELETE"])
def truncate_messages(session_id: str, message_id: int):
    delete_messages_from(session_id, message_id)
    return jsonify({"ok": True})


@sessions_bp.route("/api/sessions/<session_id>/generate-title", methods=["POST"])
def generate_title(session_id: str):
    data = request.get_json(silent=True) or {}
    message = data.get("message", "")
    if message:
        _auto_title(session_id, message)
    return jsonify({"ok": True}), 202


@sessions_bp.route("/api/messages/<int:message_id>/feedback", methods=["POST"])
def message_feedback(message_id: int):
    data = request.get_json(silent=True) or {}
    set_message_feedback(message_id, data.get("feedback"))
    return jsonify({"ok": True})


@sessions_bp.route("/api/sessions/<session_id>/export")
def export_session(session_id: str):
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    messages = get_messages(session_id)

    # format=json produces a file that round-trips through /api/sessions/import
    if request.args.get("format") == "json":
        payload = {
            "title": session["title"],
            "system_prompt": session.get("system_prompt"),
            "model": session.get("model"),
            "exported_at": session["updated_at"],
            "messages": [{"role": m["role"], "content": m["content"]} for m in messages],
        }
        return Response(
            json.dumps(payload, indent=2, ensure_ascii=False),
            mimetype="application/json",
            headers={"Content-Disposition": f'attachment; filename="chat-{session_id[:8]}.json"'},
        )

    lines = [
        f"# {session['title']}\n\n",
        f"*Exported: {session['updated_at']}*\n\n---\n\n",
    ]
    for msg in messages:
        label = "**You**" if msg["role"] == "user" else "**Assistant**"
        lines.append(f"{label}\n\n{msg['content']}\n\n---\n\n")
    return Response(
        "".join(lines),
        mimetype="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="chat-{session_id[:8]}.md"'},
    )


@sessions_bp.route("/api/search")
def search():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"results": []})
    return jsonify({"results": search_messages(query)})


@sessions_bp.route("/api/presets", methods=["GET"])
def get_presets():
    return jsonify(list_presets())


@sessions_bp.route("/api/presets", methods=["POST"])
def new_preset():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()[:Config.MAX_PRESET_NAME_LEN]
    text = str(data.get("text", "")).strip()[:Config.MAX_SYSTEM_PROMPT_LEN]
    if not name or not text:
        return jsonify({"error": "name and text are required"}), 400
    preset_id = create_preset(name, text)
    return jsonify({"id": preset_id, "name": name, "text": text}), 201


@sessions_bp.route("/api/presets/<int:preset_id>", methods=["DELETE"])
def remove_preset(preset_id: int):
    delete_preset(preset_id)
    return jsonify({"ok": True})
