import datetime

import requests
from flask import Blueprint, jsonify, request

from config import Config

health_bp = Blueprint("health", __name__)


@health_bp.route("/health")
def health_check():
    deep = request.args.get("deep") in ("1", "true")
    model_loaded = None

    if not Config.MODEL_URL:
        llm_status = "not_configured"
    else:
        try:
            resp = requests.get(f"{Config.MODEL_URL}/models", timeout=3)
            llm_status = "ok"
            if deep:
                resp.raise_for_status()
                model_ids = [m.get("id") for m in resp.json().get("data", [])]
                model_loaded = Config.MODEL_NAME in model_ids
        except Exception:
            llm_status = "unreachable"
            if deep:
                model_loaded = False

    body = {
        "status": "healthy",
        "llm_api": llm_status,
        "model": Config.MODEL_NAME,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    if deep:
        # deep=1 verifies the configured model is actually loaded on the backend —
        # the most common misconfiguration (README: 404 at inference time)
        body["model_loaded"] = model_loaded
        if llm_status != "ok" or not model_loaded:
            body["status"] = "degraded"
    return jsonify(body)
