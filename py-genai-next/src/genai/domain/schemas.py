"""Pydantic v2 API schemas (request/response models)."""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Auth ──────────────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=200)
    display_name: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UiPrefs(BaseModel):
    """Per-user appearance preferences. A closed set — unknown keys/values are
    rejected rather than persisted, so the stored JSON always renders."""
    model_config = ConfigDict(extra="forbid")

    mode: Literal["light", "dark", "system"] = "system"
    accent: Literal["blue", "violet", "emerald", "amber", "rose", "cyan", "graphite",
                    "indigo", "teal", "orange", "pink", "slate", "crimson"] = "blue"
    gradient: Literal["none", "sunset", "ocean", "forest", "grape", "ember", "steel"] = "none"
    font: Literal["inter", "jakarta", "serif", "mono",
                  "manrope", "outfit", "figtree", "lora"] = "inter"
    radius: Literal["none", "small", "medium", "large"] = "small"
    density: Literal["compact", "comfortable", "spacious"] = "comfortable"
    chat_width: Literal["narrow", "medium", "wide", "full"] = "wide"
    reduce_motion: bool = False


class UserOut(ORMModel):
    id: uuid.UUID
    email: str
    display_name: str | None
    avatar: str | None = None
    custom_instructions: str | None = None
    custom_about: str | None = None
    memory_enabled: bool = True
    memory_max_items: int = 100
    memory_recall_k: int = 8
    memory_per_message: int = 3
    memory_prompt: str | None = None
    ui_prefs: UiPrefs | None = None
    is_admin: bool = False
    created_at: datetime


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=200)


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    avatar: str | None = Field(default=None, max_length=300_000)  # builtin id or data: URL
    custom_instructions: str | None = Field(default=None, max_length=4000)
    custom_about: str | None = Field(default=None, max_length=2000)
    memory_enabled: bool | None = None
    memory_max_items: int | None = Field(default=None, ge=1, le=1000)
    memory_recall_k: int | None = Field(default=None, ge=1, le=50)
    memory_per_message: int | None = Field(default=None, ge=1, le=20)
    memory_prompt: str | None = Field(default=None, max_length=4000)
    ui_prefs: UiPrefs | None = None


# ── Personal access tokens ────────────────────────────────────────────────────
class TokenGenerateIn(BaseModel):
    name: str = Field(default="Access token", max_length=80)
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class AccessTokenOut(ORMModel):
    id: int
    name: str
    token_hint: str
    status: str = "active"          # active | expired | revoked (derived)
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime | None = None


class TokenCreatedOut(AccessTokenOut):
    token: str                       # plaintext — returned exactly once


# ── Projects ──────────────────────────────────────────────────────────────────
class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    system_prompt: str | None = None


class ProjectPatch(BaseModel):
    name: str | None = None
    system_prompt: str | None = None


class ProjectOut(ORMModel):
    id: int
    name: str
    system_prompt: str | None
    session_count: int = 0
    created_at: datetime


# ── Sessions ──────────────────────────────────────────────────────────────────
class SessionIn(BaseModel):
    title: str = "New Chat"
    system_prompt: str | None = None
    project_id: int | None = None


class SessionPatch(BaseModel):
    title: str | None = None
    system_prompt: str | None = None
    model: str | None = None
    pinned: bool | None = None
    project_id: int | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    response_format: str | None = None


class SessionOut(ORMModel):
    id: uuid.UUID
    project_id: int | None
    title: str
    system_prompt: str | None
    model: str | None
    temperature: float | None = None
    max_tokens: int | None = None
    response_format: str | None = None
    share_token: str | None = None
    pinned: bool
    created_at: datetime
    updated_at: datetime


# ── Messages ──────────────────────────────────────────────────────────────────
class MessageOut(ORMModel):
    id: int
    session_id: uuid.UUID
    role: str
    content: str
    token_usage: dict | None
    images: list[str] | None = None
    feedback: str | None
    complete: bool
    model: str | None
    latency_ms: int | None = None
    parent_id: int | None
    bookmarked: bool
    branch_count: int | None = None
    created_at: datetime


class ChatIn(BaseModel):
    message: str
    session_id: uuid.UUID | None = None
    model: str | None = None
    system_prompt: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    response_format: str | None = None    # None | "json" (structured output)
    images: list[str] | None = None
    use_memory: bool = True
    use_tools: bool = True
    use_rag: bool = True
    regenerate: bool = False
    parent_message_id: int | None = None
    save: bool = True


# ── Memory ────────────────────────────────────────────────────────────────────
class MemoryIn(BaseModel):
    content: str = Field(min_length=1, max_length=300)
    project_id: int | None = None


class MemoryPatch(BaseModel):
    content: str | None = None
    enabled: bool | None = None


class MemoryOut(ORMModel):
    id: int
    content: str
    enabled: bool
    project_id: int | None
    source_session_id: uuid.UUID | None
    created_at: datetime


# ── Documents ─────────────────────────────────────────────────────────────────
class DocumentOut(ORMModel):
    id: int
    project_id: int | None
    filename: str
    chars: int
    status: str
    chunk_count: int = 0
    created_at: datetime


# ── Presets & templates ───────────────────────────────────────────────────────
class PresetIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1)


class PresetOut(ORMModel):
    id: int
    name: str
    text: str
    created_at: datetime


class TemplateIn(BaseModel):
    trigger: str
    title: str = ""
    content: str


class TemplateOut(ORMModel):
    id: int
    trigger: str
    title: str
    content: str
    created_at: datetime
