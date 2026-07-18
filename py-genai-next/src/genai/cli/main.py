"""genai — management CLI (Typer)."""
import asyncio

import typer
from rich.console import Console
from rich.table import Table
from sqlalchemy import select

from genai.core.config import settings
from genai.core.db import SessionLocal, init_db
from genai.core.security import hash_password
from genai.domain.models import Document, User
from genai.repositories import seed_defaults
from genai.services.llm import client

app = typer.Typer(help="Hello-GenAI management CLI", no_args_is_help=True)
user_app = typer.Typer(help="User management")
app.add_typer(user_app, name="user")
token_app = typer.Typer(help="Personal access tokens")
app.add_typer(token_app, name="token")
console = Console()


async def _get_user(db, email: str):
    u = (await db.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none()
    if not u:
        console.print(f"[red]No user {email}[/red]")
        raise typer.Exit(1)
    return u


def _run(coro):
    return asyncio.run(coro)


@app.command("db-init")
def db_init():
    """Create the pgvector extension and all tables."""
    _run(init_db())
    console.print("[green]✓[/green] Database initialised (pgvector + tables).")


@user_app.command("create")
def user_create(email: str, password: str, name: str = typer.Option(None, "--name")):
    """Create a user and seed default slash-command templates."""
    async def _impl():
        async with SessionLocal() as db:
            exists = (await db.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none()
            if exists:
                console.print(f"[red]User {email} already exists[/red]")
                raise typer.Exit(1)
            u = User(email=email.lower(), hashed_password=hash_password(password), display_name=name)
            db.add(u)
            await db.commit()
            await db.refresh(u)
            await seed_defaults(db, u.id)
            console.print(f"[green]✓[/green] Created user {email} ({u.id})")
    _run(_impl())


@user_app.command("list")
def user_list():
    """List users."""
    async def _impl():
        async with SessionLocal() as db:
            users = (await db.execute(select(User).order_by(User.created_at))).scalars().all()
        table = Table("ID", "Email", "Name", "Created")
        for u in users:
            table.add_row(str(u.id), u.email, u.display_name or "", u.created_at.strftime("%Y-%m-%d"))
        console.print(table)
    _run(_impl())


@app.command("ingest")
def ingest(path: str, email: str = typer.Option(..., "--email"), project_id: int = typer.Option(None, "--project")):
    """Ingest a document (PDF/text) into a user's knowledge base."""
    async def _impl():
        text = _read_file(path)
        async with SessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none()
            if not user:
                console.print(f"[red]No user {email}[/red]")
                raise typer.Exit(1)
            import os

            from genai.tasks.jobs import ingest_document_inline
            doc = Document(user_id=user.id, project_id=project_id, filename=os.path.basename(path),
                           chars=len(text), status="processing")
            db.add(doc)
            await db.commit()
            await db.refresh(doc)
            await ingest_document_inline(db, doc.id, text)
            console.print(f"[green]✓[/green] Ingested {path} (document {doc.id}).")
    _run(_impl())


@app.command("chat")
def chat_cmd(message: str, email: str = typer.Option(..., "--email"), model: str = typer.Option(None, "--model")):
    """Send a one-off message and print the response (non-streaming)."""
    async def _impl():
        from genai.domain.schemas import ChatIn
        from genai.services.chat import stream_chat
        async with SessionLocal() as db:
            user = (await db.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none()
            if not user:
                console.print(f"[red]No user {email}[/red]")
                raise typer.Exit(1)
            parts = []
            async for ev in stream_chat(db, user, ChatIn(message=message, model=model, save=False)):
                if "token" in ev:
                    parts.append(ev["token"])
        console.print("".join(parts))
    _run(_impl())


@app.command("models")
def models():
    """List models the backend currently exposes."""
    async def _impl():
        resp = await client().get(f"{settings.LLAMA_URL}/models")
        resp.raise_for_status()
        for m in resp.json().get("data", []):
            console.print(f" • {m['id']}")
    _run(_impl())


def _read_file(path: str) -> str:
    if path.lower().endswith(".pdf"):
        from pypdf import PdfReader
        return "\n\n".join((pg.extract_text() or "") for pg in PdfReader(path).pages)
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


# ── Personal access tokens ────────────────────────────────────────────────────
@token_app.command("create")
def token_create(email: str, name: str = typer.Option("CLI token", "--name"),
                 days: int = typer.Option(None, "--days", help="Expiry in days (default 90, max 365)")):
    """Generate a personal access token for a user (printed once)."""
    async def _impl():
        from genai.services import pat
        async with SessionLocal() as db:
            user = await _get_user(db, email)
            try:
                tok, plaintext = await pat.create(db, user, name, days)
            except ValueError as e:
                console.print(f"[red]{e}[/red]")
                raise typer.Exit(1) from e
            console.print(f"[green]✓[/green] Token '{tok.name}' created — expires {tok.expires_at:%Y-%m-%d}")
            console.print("[yellow]Copy it now; it will not be shown again:[/yellow]")
            console.print(f"[bold]{plaintext}[/bold]")
    _run(_impl())


@token_app.command("list")
def token_list(email: str):
    """List a user's access tokens."""
    async def _impl():
        from genai.services import pat
        async with SessionLocal() as db:
            user = await _get_user(db, email)
            toks = await pat.list_for(db, user.id)
        table = Table("ID", "Name", "Hint", "Status", "Expires", "Last used")
        for t in toks:
            table.add_row(str(t.id), t.name, t.token_hint, pat.status_of(t),
                          t.expires_at.strftime("%Y-%m-%d"),
                          t.last_used_at.strftime("%Y-%m-%d %H:%M") if t.last_used_at else "—")
        console.print(table)
    _run(_impl())


@token_app.command("revoke")
def token_revoke(email: str, token_id: int):
    """Revoke a user's token by id."""
    async def _impl():
        from genai.services import pat
        async with SessionLocal() as db:
            user = await _get_user(db, email)
            ok = await pat.revoke(db, user.id, token_id)
        console.print("[green]✓ revoked[/green]" if ok else "[red]not found or already revoked[/red]")
    _run(_impl())


if __name__ == "__main__":
    app()
