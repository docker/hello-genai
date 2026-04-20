import threading

from flask import Blueprint, Response, jsonify, request

from services.history import (
    create_session,
    delete_messages_from,
    delete_session,
    get_messages,
    get_session,
    list_sessions,
    pin_session,
    set_message_feedback,
    update_session,
)
from services.llm import call_llm

sessions_bp = Blueprint("sessions", __name__)


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
            update_session(session_id, title=title.strip()[:80])
        except Exception:
            pass
    threading.Thread(target=_run, daemon=True).start()


@sessions_bp.route("/api/sessions", methods=["GET"])
def get_sessions():
    return jsonify(list_sessions())


@sessions_bp.route("/api/sessions", methods=["POST"])
def new_session():
    data = request.get_json(silent=True) or {}
    session_id = create_session(
        title=data.get("title", "New Chat"),
        system_prompt=data.get("system_prompt"),
    )
    return jsonify({"session_id": session_id}), 201


@sessions_bp.route("/api/sessions/<session_id>", methods=["PATCH"])
def patch_session(session_id: str):
    data = request.get_json(silent=True) or {}
    update_session(session_id, title=data.get("title"), system_prompt=data.get("system_prompt"))
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
