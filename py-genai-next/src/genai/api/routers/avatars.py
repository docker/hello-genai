"""DiceBear avatars, rendered locally.

Uses the official `dicebear-core` + `dicebear-styles` packages, which generate
SVGs offline and deterministically — the same (style, seed, options) always
produces byte-identical output, so responses are safe to cache forever.

These endpoints are deliberately **unauthenticated**: avatars are referenced from
plain `<img src=…>` tags, which cannot send a bearer token. Nothing user-specific
is exposed — the output is a pure function of a public (style, seed) pair, so
seeds must never be PII (we use opaque indices, never an email).
"""
import re
from functools import lru_cache
from importlib.resources import files

from fastapi import APIRouter, HTTPException, Query, Response, status

router = APIRouter(prefix="/api/avatars", tags=["Avatars"])

# Curated catalogue, grouped for the picker. An allowlist keeps a path segment
# from reaching the filesystem and bounds how many definitions we ever load.
STYLE_GROUPS: dict[str, list[tuple[str, str]]] = {
    "Abstract": [
        ("glyphs", "Glyphs"), ("identicon", "Identicon"), ("shapes", "Shapes"),
        ("shape-grid", "Shape Grid"), ("rings", "Rings"), ("stripes", "Stripes"),
        ("triangles", "Triangles"), ("glass", "Glass"),
    ],
    "Characters": [
        ("thumbs", "Thumbs"), ("adventurer", "Adventurer"), ("avataaars", "Avataaars"),
        ("big-ears", "Big Ears"), ("big-smile", "Big Smile"), ("bottts", "Bottts"),
        ("croodles", "Croodles"), ("dylan", "Dylan"), ("fun-emoji", "Fun Emoji"),
        ("lorelei", "Lorelei"), ("micah", "Micah"), ("miniavs", "Miniavs"),
        ("notionists", "Notionists"), ("open-peeps", "Open Peeps"), ("personas", "Personas"),
        ("pixel-art", "Pixel Art"), ("toon-head", "Toon Head"), ("disco", "Disco"),
    ],
    "Initials": [("initials", "Initials"), ("initial-face", "Initial Face"), ("icons", "Icons")],
}
STYLES: dict[str, str] = {k: v for group in STYLE_GROUPS.values() for k, v in group}

SEED_COUNT = 30                       # variants shown per style in the picker
_SEED_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_HEX_RE = re.compile(r"^[0-9a-fA-F]{6}$")
_CACHE_HEADER = "public, max-age=31536000, immutable"

# Background swatches offered in the UI (DiceBear expects hex without '#').
# Note: "transparent" is NOT accepted by the schema — omit `bg` for the style default.
BACKGROUNDS = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf",
               "e3f6c8", "f4d9b6", "cfd8dc", "94a3b8", "263238"]
FLIPS = ["none", "horizontal", "vertical", "both"]


@lru_cache(maxsize=len(STYLES))
def _style(name: str):
    from dicebear import Style
    return Style.from_json(files("dicebear_styles").joinpath(f"{name}.json").read_text("utf-8"))


@lru_cache(maxsize=4096)
def _svg(style: str, seed: str, opts_key: tuple) -> str:
    from dicebear import Avatar
    # opts_key uses tuples so it is hashable for the cache; the schema validates
    # multi-value options as JSON arrays, so they must go back to lists here.
    opts = {k: (list(v) if isinstance(v, tuple) else v) for k, v in opts_key}
    return Avatar(_style(style), {"seed": seed, **opts}).to_string()


@router.get("/styles", summary="Avatar styles and customisation options")
async def list_styles():
    return {
        "groups": [
            {"name": g, "styles": [{"id": i, "label": l} for i, l in items]}
            for g, items in STYLE_GROUPS.items()
        ],
        "seed_count": SEED_COUNT,
        "backgrounds": BACKGROUNDS,
        "flips": FLIPS,
    }


@router.get(
    "/{style}/{seed}.svg",
    summary="Render a DiceBear avatar as SVG (public, immutable)",
    response_class=Response,
    responses={200: {"content": {"image/svg+xml": {}}}},
)
async def avatar_svg(
    style: str,
    seed: str,
    # Names/types below match the DiceBear options schema exactly: `flip` is an
    # enum (not a bool), `scale` is a factor where 1 = original size (not a
    # percentage), and corner rounding is `borderRadius`. Omit `bg` for the
    # style's own background — the schema rejects "transparent".
    bg: str | None = Query(None, description="Background colour: 6-digit hex, no '#'"),
    radius: float | None = Query(None, ge=0, le=50, description="Corner rounding (50 = circle)"),
    scale: float | None = Query(None, ge=0.5, le=2.0, description="Zoom factor (1 = original)"),
    rotate: int | None = Query(None, ge=0, le=360),
    flip: str | None = Query(None, description="none | horizontal | vertical | both"),
    translateX: int | None = Query(None, ge=-50, le=50),
    translateY: int | None = Query(None, ge=-50, le=50),
):
    if style not in STYLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown avatar style '{style}'")
    if not _SEED_RE.match(seed):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid seed")

    opts: dict = {}
    if bg is not None:
        if not _HEX_RE.match(bg):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid background colour")
        opts["backgroundColor"] = [bg.lower()]
    if flip is not None:
        if flip not in FLIPS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"flip must be one of {FLIPS}")
        opts["flip"] = flip
    for key, val in (("borderRadius", radius), ("scale", scale), ("rotate", rotate),
                     ("translateX", translateX), ("translateY", translateY)):
        if val is not None:
            opts[key] = val

    # dicts are unhashable — key the cache on a stable tuple.
    key = tuple(sorted((k, tuple(v) if isinstance(v, list) else v) for k, v in opts.items()))
    try:
        svg = _svg(style, seed, key)
    except Exception as exc:  # a style may reject an option combination
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not render avatar: {exc}") from exc

    return Response(content=svg, media_type="image/svg+xml", headers={"Cache-Control": _CACHE_HEADER})
