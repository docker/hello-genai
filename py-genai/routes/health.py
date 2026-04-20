import datetime

import requests
from flask import Blueprint, jsonify

from config import Config

health_bp = Blueprint("health", __name__)


@health_bp.route("/health")
def health_check():
    if not Config.MODEL_URL:
        llm_status = "not_configured"
    else:
        try:
            requests.get(f"{Config.MODEL_URL}/models", timeout=3)
            llm_status = "ok"
        except Exception:
            llm_status = "unreachable"

    return jsonify({
        "status": "healthy",
        "llm_api": llm_status,
        "model": Config.MODEL_NAME,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })
