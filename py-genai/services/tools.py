"""Safe built-in tools the model may call (function calling).

The tool allowlist is intentionally small and side-effect-free: arithmetic, the
current time, full-text search over the user's own past conversations, and
retrieval from their uploaded documents. No shell, no network, no file writes.
"""
import ast
import datetime
import logging
import operator

from services import rag
from services.history import search_messages

logger = logging.getLogger(__name__)

# ── Individual tools ──────────────────────────────────────────────────────────

_ALLOWED_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Pow: operator.pow, ast.Mod: operator.mod,
    ast.FloorDiv: operator.floordiv, ast.USub: operator.neg, ast.UAdd: operator.pos,
}


def _safe_eval(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, int | float):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_OPS:
        return _ALLOWED_OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_OPS:
        return _ALLOWED_OPS[type(node.op)](_safe_eval(node.operand))
    raise ValueError("unsupported expression")


def _calculator(args: dict) -> str:
    expr = str(args.get("expression", ""))
    try:
        result = _safe_eval(ast.parse(expr, mode="eval").body)
        return f"{expr} = {result}"
    except Exception:
        return f"Could not evaluate: {expr!r}. Only basic arithmetic is supported."


def _current_datetime(args: dict) -> str:
    now = datetime.datetime.now(datetime.UTC)
    return now.strftime("%A, %d %B %Y, %H:%M UTC")


def _search_conversations(args: dict) -> str:
    query = str(args.get("query", "")).strip()
    if not query:
        return "No query provided."
    hits = search_messages(query, limit=5)
    if not hits:
        return f"No past messages found for {query!r}."
    lines = [
        f"- [{h['title']}] {h['snippet'].replace('[MARK]', '').replace('[/MARK]', '')}"
        for h in hits
    ]
    return "Relevant past messages:\n" + "\n".join(lines)


def _make_retrieve_documents(project_id):
    def _retrieve(args: dict) -> str:
        query = str(args.get("query", "")).strip()
        hits = rag.retrieve(query, project_id=project_id)
        if not hits:
            return "No relevant passages found in the uploaded documents."
        return "\n\n".join(f"[{h['filename']}] {h['content']}" for h in hits)
    return _retrieve


# ── OpenAI-format tool specifications ─────────────────────────────────────────

def _spec(name, description, properties, required):
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required},
        },
    }


_BASE_SPECS = [
    _spec("calculator", "Evaluate a basic arithmetic expression (+, -, *, /, **, %).",
          {"expression": {"type": "string", "description": "e.g. (12 * 7) + 3"}}, ["expression"]),
    _spec("current_datetime", "Get the current date and time (UTC).", {}, []),
    _spec("search_conversations", "Full-text search the user's own past conversations.",
          {"query": {"type": "string"}}, ["query"]),
]

_RETRIEVE_SPEC = _spec(
    "retrieve_documents", "Search the user's uploaded documents for relevant passages.",
    {"query": {"type": "string"}}, ["query"],
)


def specs_for(project_id=None, has_documents=False) -> list[dict]:
    specs = list(_BASE_SPECS)
    if rag_available := (has_documents and _embeddings_ok()):
        specs.append(_RETRIEVE_SPEC)
    logger.debug("Tool specs: base=%d retrieve=%s", len(_BASE_SPECS), rag_available)
    return specs


def _embeddings_ok() -> bool:
    from services import embeddings
    return embeddings.available()


def execute_tool(name: str, args: dict, project_id=None) -> str:
    """Dispatch a single tool call to its handler and return the text result."""
    dispatch = {
        "calculator": _calculator,
        "current_datetime": _current_datetime,
        "search_conversations": _search_conversations,
        "retrieve_documents": _make_retrieve_documents(project_id),
    }
    handler = dispatch.get(name)
    return handler(args) if handler else f"Unknown tool: {name}"
