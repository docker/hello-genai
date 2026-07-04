import hmac
import logging

from flask import (
    Flask,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from flask_swagger_ui import get_swaggerui_blueprint

from config import Config
from extensions import cache, limiter
from routes.chat import chat_bp
from routes.health import health_bp
from routes.memory import memory_bp
from routes.models import models_bp
from routes.sessions import sessions_bp
from routes.stats import stats_bp
from services.history import init_db

logger = logging.getLogger(__name__)

# Paths that never require authentication (health for probes, login, PWA shell)
_PUBLIC_PATHS = {"/health", "/login", "/logout", "/manifest.webmanifest", "/sw.js", "/favicon.ico"}


def _key_matches(provided: str) -> bool:
    return bool(provided) and hmac.compare_digest(provided, Config.APP_API_KEY)


def _request_authorized() -> bool:
    if session.get("authed"):
        return True
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer ") and _key_matches(auth[7:]):
        return True
    return _key_matches(request.headers.get("X-API-Key", ""))


def create_app() -> Flask:
    app = Flask(__name__, static_url_path="/static", static_folder="static")
    app.secret_key = Config.SECRET_KEY
    app.config["CACHE_TYPE"] = "SimpleCache"
    app.config["CACHE_DEFAULT_TIMEOUT"] = Config.CACHE_TIMEOUT
    app.config["MAX_CONTENT_LENGTH"] = Config.MAX_UPLOAD_BYTES

    cache.init_app(app)
    limiter.init_app(app)

    swaggerui = get_swaggerui_blueprint(
        "/api/docs",
        "/static/swagger.json",
        config={
            "app_name": "Hello-GenAI API",
            "tryItOutEnabled": True,
            "supportedSubmitMethods": ["get", "post", "put", "delete", "patch", "head", "options"],
        },
    )
    app.register_blueprint(swaggerui, url_prefix="/api/docs")
    app.register_blueprint(chat_bp)
    app.register_blueprint(models_bp)
    app.register_blueprint(sessions_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(memory_bp)

    # ── Optional authentication gate ──────────────────────────────────────────
    @app.before_request
    def require_auth():
        if not Config.auth_enabled():
            return None
        path = request.path
        if path in _PUBLIC_PATHS or path.startswith("/static/"):
            return None
        if _request_authorized():
            return None
        if path.startswith("/api/") or path == "/preview":
            return jsonify({"error": "Unauthorized"}), 401
        return redirect(url_for("login", next=path))

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if not Config.auth_enabled():
            return redirect(url_for("index"))
        error = None
        if request.method == "POST":
            if _key_matches(request.form.get("api_key", "")):
                session["authed"] = True
                session.permanent = True
                return redirect(request.args.get("next") or url_for("index"))
            error = "Incorrect key. Try again."
        return render_template("login.html", error=error), (401 if error else 200)

    @app.route("/logout")
    def logout():
        session.clear()
        return redirect(url_for("login"))

    @app.route("/")
    def index():
        return render_template(
            "index.html",
            auth_enabled=Config.auth_enabled(),
            context_max=Config.LLM_CONTEXT_MAX_TOKENS,
            max_images=Config.MAX_IMAGES_PER_MESSAGE,
        )

    @app.route("/preview")
    def preview():
        return render_template("preview.html")

    # ── PWA (installable, offline app shell) ──────────────────────────────────
    @app.route("/manifest.webmanifest")
    def manifest():
        return send_from_directory(app.static_folder, "manifest.webmanifest",
                                   mimetype="application/manifest+json")

    @app.route("/sw.js")
    def service_worker():
        # Served from root so its scope covers the whole app
        resp = send_from_directory(app.static_folder, "sw.js", mimetype="application/javascript")
        resp.headers["Service-Worker-Allowed"] = "/"
        resp.headers["Cache-Control"] = "no-cache"
        return resp

    @app.route("/favicon.ico")
    def favicon():
        return send_from_directory(app.static_folder, "favicon.ico")

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # All JS/CSS/fonts are vendored under /static/vendor — no CDN, no inline scripts.
        # Swagger UI is the one exception: its index page bootstraps via an inline script.
        script_src = "'self' 'unsafe-inline'" if request.path.startswith("/api/docs") else "'self'"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            f"script-src {script_src}; "
            "style-src 'self' 'unsafe-inline'; "
            "font-src 'self'; "
            "img-src 'self' data:; "
            "connect-src 'self'; "
            "manifest-src 'self'; "
            "worker-src 'self'"
        )
        return response

    return app


if __name__ == "__main__":
    logging.basicConfig(
        level=getattr(logging, Config.LOG_LEVEL, logging.INFO),
        format="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
    )
    Config.validate()
    init_db()
    app = create_app()
    app.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG)
