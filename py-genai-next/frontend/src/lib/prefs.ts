/**
 * Appearance preferences.
 *
 * Source of truth is the server (`users.ui_prefs`, validated closed set), but we
 * mirror to localStorage so the pre-paint script in index.html can apply them
 * before first paint — no flash — and so the UI stays instant/offline-tolerant.
 *
 * Applying a pref only re-points CSS custom properties via data-* attributes on
 * <html>; every surface reads those tokens, so one attribute repaints the app.
 */

export type Mode = "light" | "dark" | "system";
export type Accent = "blue" | "violet" | "emerald" | "amber" | "rose" | "cyan" | "graphite"
  | "indigo" | "teal" | "orange" | "pink" | "slate" | "crimson";
export type Gradient = "none" | "sunset" | "ocean" | "forest" | "grape" | "ember" | "steel";
export type Font = "inter" | "jakarta" | "serif" | "mono" | "manrope" | "outfit" | "figtree" | "lora";
export type Radius = "none" | "small" | "medium" | "large";
export type Density = "compact" | "comfortable" | "spacious";
export type ChatWidth = "narrow" | "medium" | "wide" | "full";

export type Prefs = {
  mode: Mode;
  accent: Accent;
  gradient: Gradient;
  font: Font;
  radius: Radius;
  density: Density;
  chat_width: ChatWidth;
  reduce_motion: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  mode: "system",
  accent: "blue",
  gradient: "none",
  font: "inter",
  radius: "small",
  density: "comfortable",
  chat_width: "wide",
  reduce_motion: false,
};

/* Option catalogues — swatches mirror index.css and are WCAG-AA validated. */
export const ACCENTS: { id: Accent; label: string; light: string; dark: string }[] = [
  { id: "blue", label: "Blue", light: "#2463eb", dark: "#61a6fa" },
  { id: "violet", label: "Violet", light: "#7c3bed", dark: "#ac8bf9" },
  { id: "emerald", label: "Emerald", light: "#0b7a57", dark: "#1eeba7" },
  { id: "amber", label: "Amber", light: "#db7706", dark: "#fbbd23" },
  { id: "rose", label: "Rose", light: "#e21d48", dark: "#fb6f84" },
  { id: "cyan", label: "Cyan", light: "#0e7690", dark: "#21d5ed" },
  { id: "graphite", label: "Graphite", light: "#48566a", dark: "#94a3b8" },
  { id: "indigo", label: "Indigo", light: "#2427e5", dark: "#828df8" },
  { id: "teal", label: "Teal", light: "#0b837f", dark: "#17cfb6" },
  { id: "orange", label: "Orange", light: "#e9640c", dark: "#fb923c" },
  { id: "pink", label: "Pink", light: "#de2176", dark: "#f872b5" },
  { id: "slate", label: "Slate", light: "#4d6280", dark: "#93aac8" },
  { id: "crimson", label: "Crimson", light: "#cf1736", dark: "#f96c84" },
];

/** Optional duotone wash painted over brand-filled surfaces (buttons, logo). */
export const GRADIENTS: { id: Gradient; label: string; css: string }[] = [
  { id: "none", label: "None", css: "" },
  { id: "sunset", label: "Sunset", css: "linear-gradient(135deg,#f08a1e,#e0407f)" },
  { id: "ocean", label: "Ocean", css: "linear-gradient(135deg,#149ed1,#2f37e8)" },
  { id: "forest", label: "Forest", css: "linear-gradient(135deg,#0d9b6c,#0fa093)" },
  { id: "grape", label: "Grape", css: "linear-gradient(135deg,#8b5cf6,#e2429b)" },
  { id: "ember", label: "Ember", css: "linear-gradient(135deg,#e51a3c,#f5a022)" },
  { id: "steel", label: "Steel", css: "linear-gradient(135deg,#566d8f,#1291c2)" },
];

export const FONTS: { id: Font; label: string; note: string; stack: string }[] = [
  { id: "inter", label: "Inter", note: "Neutral UI sans", stack: '"Inter Variable", Inter, system-ui, sans-serif' },
  { id: "jakarta", label: "Jakarta", note: "Geometric, friendly", stack: '"Plus Jakarta Sans Variable", "Inter Variable", system-ui, sans-serif' },
  { id: "serif", label: "Source Serif", note: "Editorial, readable", stack: '"Source Serif 4 Variable", Georgia, serif' },
  { id: "mono", label: "JetBrains Mono", note: "Terminal feel", stack: '"JetBrains Mono Variable", ui-monospace, monospace' },
  { id: "manrope", label: "Manrope", note: "Modern, semi-rounded", stack: '"Manrope Variable", system-ui, sans-serif' },
  { id: "outfit", label: "Outfit", note: "Clean geometric", stack: '"Outfit Variable", system-ui, sans-serif' },
  { id: "figtree", label: "Figtree", note: "Warm, approachable", stack: '"Figtree Variable", system-ui, sans-serif' },
  { id: "lora", label: "Lora", note: "Classic serif", stack: '"Lora Variable", Georgia, serif' },
];

export const RADII: { id: Radius; label: string }[] = [
  { id: "none", label: "Sharp" },
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Round" },
];

export const DENSITIES: { id: Density; label: string; note: string }[] = [
  { id: "compact", label: "Compact", note: "More on screen" },
  { id: "comfortable", label: "Comfortable", note: "Default" },
  { id: "spacious", label: "Spacious", note: "Larger text" },
];

export const CHAT_WIDTHS: { id: ChatWidth; label: string }[] = [
  { id: "narrow", label: "Narrow" },
  { id: "medium", label: "Medium" },
  { id: "wide", label: "Wide" },
  { id: "full", label: "Full" },
];

const KEY = "ui_prefs";

function systemDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** Coerce anything (old/partial/garbage) into a valid Prefs. */
export function normalize(raw: any): Prefs {
  const p = { ...DEFAULT_PREFS };
  if (!raw || typeof raw !== "object") return p;
  const pick = <K extends keyof Prefs>(k: K, allowed: readonly string[]) => {
    if (typeof raw[k] === "string" && allowed.includes(raw[k])) (p as any)[k] = raw[k];
  };
  pick("mode", ["light", "dark", "system"]);
  pick("accent", ACCENTS.map((a) => a.id));
  pick("gradient", GRADIENTS.map((g) => g.id));
  pick("font", FONTS.map((f) => f.id));
  pick("radius", RADII.map((r) => r.id));
  pick("density", DENSITIES.map((d) => d.id));
  pick("chat_width", CHAT_WIDTHS.map((w) => w.id));
  if (typeof raw.reduce_motion === "boolean") p.reduce_motion = raw.reduce_motion;
  return p;
}

let cache: Prefs | null = null;

export function getPrefs(): Prefs {
  if (cache) return cache;
  try {
    cache = normalize(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    cache = { ...DEFAULT_PREFS };
  }
  return cache;
}

/** Resolve "system" to a concrete mode. */
export function resolvedMode(p: Prefs = getPrefs()): "light" | "dark" {
  return p.mode === "system" ? (systemDark() ? "dark" : "light") : p.mode;
}

export function applyPrefs(p: Prefs) {
  const el = document.documentElement;
  const dark = resolvedMode(p) === "dark";
  el.classList.toggle("dark", dark);
  el.style.colorScheme = dark ? "dark" : "light";
  el.dataset.accent = p.accent;
  el.dataset.gradient = p.gradient;
  el.dataset.font = p.font;
  el.dataset.radius = p.radius;
  el.dataset.density = p.density;
  el.dataset.chatWidth = p.chat_width;
  el.dataset.motion = p.reduce_motion ? "reduced" : "full";
}

const PREFS_EVENT = "genai:prefs";
export function onPrefs(fn: (p: Prefs) => void) {
  const h = (e: Event) => fn((e as CustomEvent).detail as Prefs);
  window.addEventListener(PREFS_EVENT, h);
  return () => window.removeEventListener(PREFS_EVENT, h);
}

/** Persist locally + apply + broadcast. Server sync is the caller's job (see setPrefs). */
function commit(p: Prefs) {
  cache = p;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
  applyPrefs(p);
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: p }));
}

/** Push to the server, coalescing rapid changes (e.g. dragging through accents). */
let timer: number | undefined;
let syncer: ((p: Prefs) => Promise<any>) | null = null;
export function registerPrefsSync(fn: (p: Prefs) => Promise<any>) { syncer = fn; }

export function setPrefs(patch: Partial<Prefs>) {
  const next = { ...getPrefs(), ...patch };
  commit(next);
  if (!syncer) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { syncer?.(next).catch(() => { /* keep local copy */ }); }, 400);
}

/** Adopt the server's copy on login (server wins; falls back to local for new users). */
export function hydratePrefs(serverPrefs: any) {
  commit(serverPrefs ? normalize(serverPrefs) : getPrefs());
}

/** Apply persisted prefs and track OS theme changes while on "system". */
export function initPrefs() {
  applyPrefs(getPrefs());
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (getPrefs().mode === "system") applyPrefs(getPrefs());
  });
}

/* ── Back-compat helpers (navbar theme toggle, accent picker) ─────────────── */
export type Theme = "light" | "dark";
export const getTheme = (): Theme => resolvedMode();
export const setTheme = (t: Theme) => setPrefs({ mode: t });
export const getAccent = (): Accent => getPrefs().accent;
export const setAccent = (a: Accent) => setPrefs({ accent: a });
export const initTheme = initPrefs;
