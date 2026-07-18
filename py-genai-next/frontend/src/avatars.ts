// Avatars are DiceBear SVGs rendered by the backend (dicebear-core, offline and
// deterministic) and served from /api/avatars/<style>/<seed>.svg?<options>.
//
// Persisted on `user.avatar` as:
//   "dicebear:<style>:<seed>[?opts]"  — a configured DiceBear avatar
//   "data:…" / "http…"                — an uploaded picture
//   "builtin:<n>"                     — LEGACY emoji set, mapped onto a seed.
//
// Option names/types mirror the DiceBear schema exactly: `flip` is an enum,
// `scale` is a factor (1 = original size), corner rounding is `radius`
// (borderRadius server-side, 50 = circle).

export type AvatarOpts = {
  bg?: string;        // 6-digit hex, no '#'
  radius?: number;    // 0–50
  scale?: number;     // 0.5–2
  rotate?: number;    // 0–360
  flip?: Flip;
};

export type Flip = "none" | "horizontal" | "vertical" | "both";
export const FLIPS: Flip[] = ["none", "horizontal", "vertical", "both"];

export const BACKGROUNDS = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf",
  "e3f6c8", "f4d9b6", "cfd8dc", "94a3b8", "263238"];

/** Fallback catalogue; /api/avatars/styles is authoritative and loaded at runtime. */
export const STYLE_GROUPS: { name: string; styles: { id: string; label: string }[] }[] = [
  { name: "Abstract", styles: [
    { id: "glyphs", label: "Glyphs" }, { id: "identicon", label: "Identicon" },
    { id: "shapes", label: "Shapes" }, { id: "shape-grid", label: "Shape Grid" },
    { id: "rings", label: "Rings" }, { id: "stripes", label: "Stripes" },
    { id: "triangles", label: "Triangles" }, { id: "glass", label: "Glass" }] },
  { name: "Characters", styles: [
    { id: "thumbs", label: "Thumbs" }, { id: "adventurer", label: "Adventurer" },
    { id: "avataaars", label: "Avataaars" }, { id: "big-ears", label: "Big Ears" },
    { id: "big-smile", label: "Big Smile" }, { id: "bottts", label: "Bottts" },
    { id: "croodles", label: "Croodles" }, { id: "dylan", label: "Dylan" },
    { id: "fun-emoji", label: "Fun Emoji" }, { id: "lorelei", label: "Lorelei" },
    { id: "micah", label: "Micah" }, { id: "miniavs", label: "Miniavs" },
    { id: "notionists", label: "Notionists" }, { id: "open-peeps", label: "Open Peeps" },
    { id: "personas", label: "Personas" }, { id: "pixel-art", label: "Pixel Art" },
    { id: "toon-head", label: "Toon Head" }, { id: "disco", label: "Disco" }] },
  { name: "Initials", styles: [
    { id: "initials", label: "Initials" }, { id: "initial-face", label: "Initial Face" },
    { id: "icons", label: "Icons" }] },
];

export const ALL_STYLES = STYLE_GROUPS.flatMap((g) => g.styles);
const STYLE_IDS = new Set(ALL_STYLES.map((s) => s.id));
const DEFAULT_STYLE = "glyphs";

export const SEED_COUNT = 30;
export const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => String(i + 1));

/** Random seed for the "surprise me" button — kept inside the server's seed charset. */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function qs(o: AvatarOpts = {}): string {
  const p = new URLSearchParams();
  if (o.bg) p.set("bg", o.bg);
  if (o.radius != null) p.set("radius", String(o.radius));
  if (o.scale != null && o.scale !== 1) p.set("scale", String(o.scale));
  if (o.rotate) p.set("rotate", String(o.rotate));
  if (o.flip && o.flip !== "none") p.set("flip", o.flip);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** URL for a DiceBear avatar. Same-origin, so it resolves on any device. */
export function avatarUrl(style: string, seed: string, opts: AvatarOpts = {}): string {
  const s = STYLE_IDS.has(style) ? style : DEFAULT_STYLE;
  return `/api/avatars/${s}/${encodeURIComponent(seed)}.svg${qs(opts)}`;
}

/** Persisted value; options ride along as a query string. */
export function avatarValue(style: string, seed: string, opts: AvatarOpts = {}): string {
  return `dicebear:${style}:${seed}${qs(opts)}`;
}

export type ParsedAvatar =
  | { kind: "image"; src: string }
  | { kind: "dicebear"; style: string; seed: string; opts: AvatarOpts; src: string }
  | { kind: "none" };

function parseOpts(query: string): AvatarOpts {
  const p = new URLSearchParams(query);
  const num = (k: string) => (p.has(k) ? Number(p.get(k)) : undefined);
  const flip = p.get("flip") as Flip | null;
  return {
    bg: p.get("bg") || undefined,
    radius: num("radius"),
    scale: num("scale"),
    rotate: num("rotate"),
    flip: flip && FLIPS.includes(flip) ? flip : undefined,
  };
}

export function parseAvatar(avatar?: string | null): ParsedAvatar {
  if (!avatar) return { kind: "none" };
  if (avatar.startsWith("data:") || avatar.startsWith("http")) return { kind: "image", src: avatar };

  if (avatar.startsWith("dicebear:")) {
    const rest = avatar.slice("dicebear:".length);
    const [style, tail = ""] = [rest.slice(0, rest.indexOf(":")), rest.slice(rest.indexOf(":") + 1)];
    const qIdx = tail.indexOf("?");
    const seed = qIdx === -1 ? tail : tail.slice(0, qIdx);
    const opts = qIdx === -1 ? {} : parseOpts(tail.slice(qIdx + 1));
    if (style && seed) {
      const s = STYLE_IDS.has(style) ? style : DEFAULT_STYLE;
      return { kind: "dicebear", style: s, seed, opts, src: avatarUrl(s, seed, opts) };
    }
    return { kind: "none" };
  }

  // Legacy emoji avatars — keep these users looking intentional rather than
  // dropping them back to initials.
  if (avatar.startsWith("builtin:")) {
    const n = parseInt(avatar.slice(8), 10) || 0;
    const seed = String((n % SEED_COUNT) + 1);
    return { kind: "dicebear", style: DEFAULT_STYLE, seed, opts: {}, src: avatarUrl(DEFAULT_STYLE, seed) };
  }
  return { kind: "none" };
}

/** B12 — deterministic DiceBear face for a persona/preset, derived from its name
 *  so no extra column or user choice is needed: same name → same face, always. */
export function personaAvatarUrl(name: string, size = 24): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const styles = ["thumbs", "bottts", "lorelei", "notionists", "fun-emoji", "personas"];
  return avatarUrl(styles[h % styles.length], String((h >>> 3) % 9999), { radius: 50 });
}
