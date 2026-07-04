"""Persistent chat memory.

After each exchange the LLM is asked (in a background thread, like auto-title)
whether the user's message contains durable facts worth remembering across
conversations. New facts are stored in the `memories` table and injected into
the system prompt of every future chat.
"""
import logging
from concurrent.futures import ThreadPoolExecutor

from config import Config
from services.history import create_memory, list_memories
from services.llm import call_llm, strip_think

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="memory")

_EXTRACTION_PROMPT = (
    "You maintain long-term memory for an AI assistant. From the user message below, "
    "extract up to 3 durable facts about the user that are worth remembering across "
    "future conversations — their name, role, preferences, projects, goals, or constraints.\n"
    "Rules:\n"
    "- One fact per line, plain text, third person (e.g. \"User prefers Python\").\n"
    "- Under 120 characters each. No bullets, numbering, or commentary.\n"
    "- Ignore one-off requests, questions, and anything ephemeral.\n"
    "- If nothing is worth remembering, reply with exactly: NONE\n\n"
    "User message:\n"
)


def extract_and_store(user_message: str, session_id: str | None = None) -> list[str]:
    """Ask the LLM for durable facts in the message; store new ones. Returns stored facts."""
    if len(list_memories()) >= Config.MEMORY_MAX_ITEMS:
        logger.debug("Memory cap (%d) reached; skipping extraction", Config.MEMORY_MAX_ITEMS)
        return []

    reply, _ = call_llm(
        [{"role": "user", "content": _EXTRACTION_PROMPT + user_message[:2000]}],
        max_tokens=300,
    )
    reply = strip_think(reply)

    existing = {m["content"].strip().lower() for m in list_memories()}
    stored: list[str] = []
    for line in reply.splitlines():
        fact = line.strip().lstrip("-•*0123456789. ").strip()
        if not fact or fact.upper() == "NONE" or len(fact) > 200:
            continue
        if fact.lower() in existing:
            continue
        create_memory(fact, source_session_id=session_id)
        existing.add(fact.lower())
        stored.append(fact)
        if len(stored) >= 3:
            break
    if stored:
        logger.info("Remembered %d new fact(s)", len(stored))
    return stored


def remember_async(user_message: str, session_id: str | None = None) -> None:
    """Fire-and-forget extraction; never blocks or fails the chat request."""
    if not Config.MEMORY_ENABLED:
        return

    def _run():
        try:
            extract_and_store(user_message, session_id)
        except Exception:
            logger.debug("Memory extraction failed", exc_info=True)

    _executor.submit(_run)
