"""Safe built-in tools for function calling (async, user-scoped)."""
import ast
import datetime
import html
import operator
import re
import uuid
from urllib.parse import unquote

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from genai.core.config import settings
from genai.domain.models import Message, Session
from genai.services import embeddings, rag

_UA = "Mozilla/5.0 (compatible; HelloGenAI/1.0; +local)"
_TAGS = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    return html.unescape(_TAGS.sub("", text)).strip()


async def web_search(query: str, max_results: int = 5) -> str:
    """Search the web via DuckDuckGo (no API key). Returns titles, snippets, URLs."""
    query = query.strip()
    if not query:
        return "No search query provided."
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True, headers={"User-Agent": _UA}) as c:
            r = await c.post("https://html.duckduckgo.com/html/", data={"q": query, "kl": "us-en"})
            r.raise_for_status()
            page = r.text
    except Exception as e:
        return f"Web search failed ({type(e).__name__}). The network may be unavailable."

    links = re.findall(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', page, re.S)
    snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', page, re.S)
    results = []
    for i, (url, title) in enumerate(links[:max_results]):
        if "uddg=" in url:  # unwrap DuckDuckGo redirect
            url = unquote(url.split("uddg=")[1].split("&")[0])
        snippet = _clean(snippets[i]) if i < len(snippets) else ""
        results.append(f"{i + 1}. {_clean(title)}\n   {snippet}\n   {url}")
    if not results:
        return f"No web results found for {query!r}."
    return f"Web results for {query!r}:\n\n" + "\n\n".join(results)


async def fetch_url(url: str, max_chars: int = 3000) -> str:
    """Fetch a URL and return its readable text (HTML stripped, truncated)."""
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers={"User-Agent": _UA}) as c:
            r = await c.get(url)
            r.raise_for_status()
            body = r.text
    except Exception as e:
        return f"Could not fetch {url} ({type(e).__name__})."
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", body, flags=re.S | re.I)
    text = re.sub(r"\s+", " ", _clean(body))
    return text[:max_chars] or "No readable text found at that URL."

_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Pow: operator.pow, ast.Mod: operator.mod,
    ast.FloorDiv: operator.floordiv, ast.USub: operator.neg, ast.UAdd: operator.pos,
}


def _safe_eval(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, int | float):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_safe_eval(node.operand))
    raise ValueError("unsupported expression")


def calculator(expr: str) -> str:
    try:
        return f"{expr} = {_safe_eval(ast.parse(expr, mode='eval').body)}"
    except Exception:
        return f"Could not evaluate {expr!r}. Only basic arithmetic is supported."


def _spec(name, description, properties, required):
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object", "properties": properties, "required": required}}}


BASE_SPECS = [
    _spec("calculator", "Evaluate a basic arithmetic expression (+, -, *, /, **, %).",
          {"expression": {"type": "string"}}, ["expression"]),
    _spec("current_datetime", "Get the current date and time (UTC).", {}, []),
    _spec("search_conversations", "Full-text search the user's own past conversations.",
          {"query": {"type": "string"}}, ["query"]),
]
RETRIEVE_SPEC = _spec("retrieve_documents", "Search the user's uploaded documents for relevant passages.",
                      {"query": {"type": "string"}}, ["query"])
WEB_SPECS = [
    _spec("web_search", "Search the live web for current information, news, facts, or anything you don't know. "
                        "Use this whenever the answer may depend on recent or external knowledge.",
          {"query": {"type": "string"}}, ["query"]),
    _spec("fetch_url", "Fetch a web page by URL and read its text content.",
          {"url": {"type": "string"}}, ["url"]),
]


def specs_for(has_documents: bool) -> list[dict]:
    specs = list(BASE_SPECS)
    if has_documents and embeddings.available():
        specs.append(RETRIEVE_SPEC)
    if settings.WEB_SEARCH_ENABLED:
        specs.extend(WEB_SPECS)
    return specs


async def execute_tool(db: AsyncSession, user_id: uuid.UUID, name: str, args: dict,
                       project_id: int | None = None) -> str:
    if name == "calculator":
        return calculator(str(args.get("expression", "")))
    if name == "current_datetime":
        return datetime.datetime.now(datetime.UTC).strftime("%A, %d %B %Y, %H:%M UTC")
    if name == "web_search":
        return await web_search(str(args.get("query", "")))
    if name == "fetch_url":
        return await fetch_url(str(args.get("url", "")))
    if name == "search_conversations":
        q = str(args.get("query", "")).strip()
        if not q:
            return "No query provided."
        stmt = (
            select(Message.content, Session.title)
            .join(Session, Session.id == Message.session_id)
            .where(Session.user_id == user_id, Message.content.ilike(f"%{q}%"))
            .order_by(Message.id.desc()).limit(5)
        )
        rows = (await db.execute(stmt)).all()
        if not rows:
            return f"No past messages found for {q!r}."
        return "Relevant past messages:\n" + "\n".join(f"- [{t}] {c[:160]}" for c, t in rows)
    if name == "retrieve_documents":
        hits = await rag.retrieve(db, user_id, str(args.get("query", "")), project_id)
        if not hits:
            return "No relevant passages found in the uploaded documents."
        return "\n\n".join(f"[{h['filename']}] {h['content']}" for h in hits)
    return f"Unknown tool: {name}"
