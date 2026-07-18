"""Domain models — importing this registers all tables on Base.metadata."""
from genai.domain.models import (
    Document,
    DocumentChunk,
    Memory,
    Message,
    Preset,
    Project,
    Session,
    Template,
    User,
)

__all__ = [
    "User", "Project", "Session", "Message",
    "Memory", "Document", "DocumentChunk", "Preset", "Template",
]
