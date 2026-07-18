import { useEffect, useRef, useState } from "react";
import { api, API_BASE } from "../api";
import { ALL_STYLES } from "../avatars";
import { DiceBearPicker, ImageEditor } from "./AvatarStudio";
import { cn } from "../lib/utils";
import { Avatar } from "./Avatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Select } from "./ui/select";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import {
  ACCENTS, CHAT_WIDTHS, DENSITIES, FONTS, GRADIENTS, RADII,
  getPrefs, onPrefs, resolvedMode, setPrefs, type Prefs,
} from "../lib/prefs";
import { CheckIcon, ChevronRightIcon, ChipIcon, CopyIcon, PlusIcon, ShieldIcon, SparklesIcon, SunIcon, TrashIcon, UploadIcon, UserIcon, WandIcon } from "./icons";

const NAV = [
  { id: "profile", label: "Profile", icon: UserIcon, desc: "Your name, photo, and avatar." },
  { id: "appearance", label: "Appearance", icon: SunIcon, desc: "Pick the accent color used across the app." },
  { id: "personalization", label: "Personalization", icon: WandIcon, desc: "Custom instructions applied to every chat." },
  { id: "memory", label: "Memory", icon: SparklesIcon, desc: "What the assistant remembers about you." },
  { id: "security", label: "Security", icon: ShieldIcon, desc: "Change your account password." },
  { id: "tokens", label: "API tokens", icon: ChipIcon, desc: "Credentials for the API, CLI, and OpenAI SDK." },
] as const;

const SectionHint = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
);

export function ProfileModal({ user, onSaved, onClose }: { user: any; onSaved: (u: any) => void; onClose: () => void }) {
  const [name, setName] = useState(user.display_name || "");
  const [avatar, setAvatar] = useState<string | null>(user.avatar || null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<(typeof NAV)[number]["id"]>("profile");
  const [showAvatars, setShowAvatars] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);  // data URL being cropped
  const [instr, setInstr] = useState(user.custom_instructions || "");
  const [about, setAbout] = useState(user.custom_about || "");
  const [mem, setMem] = useState({
    memory_enabled: user.memory_enabled ?? true,
    memory_max_items: user.memory_max_items ?? 100,
    memory_recall_k: user.memory_recall_k ?? 8,
    memory_per_message: user.memory_per_message ?? 3,
  });
  const [memPrompt, setMemPrompt] = useState<string>(user.memory_prompt || "");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.config().then((c) => {
      const dp = c.default_memory_prompt || "";
      setDefaultPrompt(dp);
      if (!user.memory_prompt) setMemPrompt(dp);   // show the active default, editable
    }).catch(() => {});
  }, []);

  // Uploads open the editor; the editor produces the final square data URL.
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setEditing(String(reader.result)); setShowAvatars(false); };
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true);
    try {
      // Empty string (or matching the default) resets to the built-in prompt.
      const memory_prompt = memPrompt.trim() && memPrompt.trim() !== defaultPrompt.trim() ? memPrompt.trim() : "";
      const updated = await api.updateProfile({ display_name: name.trim(), avatar, custom_instructions: instr, custom_about: about, ...mem, memory_prompt });
      onSaved(updated);
      onClose();
    } catch { setBusy(false); }
  }

  const active = NAV.find((n) => n.id === tab)!;
  // Sections that persist on their own (not via the Save button).
  const profileScoped = tab !== "security" && tab !== "tokens" && tab !== "appearance";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex h-[min(88dvh,780px)] flex-col sm:flex-row">
          {/* Section nav */}
          <nav className="flex shrink-0 flex-wrap gap-1 border-b bg-muted/40 p-2.5 sm:w-64 sm:flex-nowrap sm:flex-col sm:border-b-0 sm:border-r sm:p-4">
            <div className="mb-1 hidden items-center gap-3 px-2 pb-2 pt-1 sm:flex">
              <Avatar avatar={avatar} name={name || user.email} size={38} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{name || "Your account"}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
            </div>
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={cn(
                  "relative flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:w-full sm:gap-3 sm:py-2.5",
                  tab === n.id
                    ? "bg-card text-foreground shadow-sm before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-brand sm:before:block"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
              >
                <n.icon size={16} /> {n.label}
              </button>
            ))}
          </nav>

          {/* Content pane */}
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="shrink-0 border-b px-5 py-4 pr-14 sm:px-8 sm:py-5">
              <h3 className="text-base font-semibold tracking-heading">{active.label}</h3>
              <SectionHint>{active.desc}</SectionHint>
            </header>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 scrollbar-thin sm:space-y-7 sm:px-8 sm:py-6">
              {tab === "profile" && (
                <>
                  <div className="flex items-center gap-4">
                    <Avatar avatar={avatar} name={name || user.email} size={72} />
                    <div className="flex flex-col gap-2">
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><UploadIcon size={15} /> Upload photo</Button>
                        {avatar && <Button variant="ghost" size="sm" onClick={() => setAvatar(null)}>Remove</Button>}
                      </div>
                      <span className="text-xs text-muted-foreground">JPG or PNG · crop, zoom and rotate after uploading.</span>
                    </div>
                  </div>

                  {editing && (
                    <ImageEditor
                      src={editing}
                      onCancel={() => setEditing(null)}
                      onApply={(dataUrl) => { setAvatar(dataUrl); setEditing(null); }}
                    />
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Display name</label>
                    <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input value={user.email} disabled readOnly className="text-muted-foreground" />
                  </div>

                  <div>
                    <button
                      className="flex w-full items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm transition-colors hover:bg-muted/60"
                      onClick={() => setShowAvatars((v) => !v)}
                      aria-expanded={showAvatars}
                    >
                      <ChevronRightIcon size={15} className={cn("transition-transform", showAvatars && "rotate-90")} />
                      <span className="font-medium">Choose a DiceBear avatar</span>
                      <span className="ml-auto text-xs text-muted-foreground">{ALL_STYLES.length} styles</span>
                    </button>
                    {showAvatars && <DiceBearPicker value={avatar} onPick={setAvatar} />}
                  </div>
                </>
              )}

              {tab === "personalization" && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">How should the assistant respond?</label>
                    <SectionHint>Tone, format, language, and level of detail.</SectionHint>
                    <Textarea placeholder="e.g. Be concise and direct. Prefer code examples. Use British English." value={instr} maxLength={4000} onChange={(e) => setInstr(e.target.value)} rows={5} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">What should the assistant know about you?</label>
                    <SectionHint>Your role, projects, and preferences.</SectionHint>
                    <Textarea placeholder="e.g. I'm a backend engineer working on a FastAPI project." value={about} maxLength={2000} onChange={(e) => setAbout(e.target.value)} rows={5} />
                  </div>
                </>
              )}

              {tab === "memory" && (
                <>
                  <label className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm shadow-sm">
                    <span className="font-medium">Automatically remember facts as I chat</span>
                    <Switch checked={mem.memory_enabled} onCheckedChange={(v) => setMem({ ...mem, memory_enabled: v })} />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <MemNum label="Max stored" hint="total cap" value={mem.memory_max_items} min={1} max={1000} onChange={(v) => setMem({ ...mem, memory_max_items: v })} />
                    <MemNum label="Recalled per reply" hint="into context" value={mem.memory_recall_k} min={1} max={50} onChange={(v) => setMem({ ...mem, memory_recall_k: v })} />
                    <MemNum label="Saved per message" hint="extraction cap" value={mem.memory_per_message} min={1} max={20} onChange={(v) => setMem({ ...mem, memory_per_message: v })} />
                  </div>
                  <div className="space-y-2.5 rounded-xl border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">Extraction prompt</div>
                        <span className="text-xs text-muted-foreground">What the assistant decides to remember.</span>
                      </div>
                      <Select
                        className="w-48"
                        value={matchPreset(memPrompt, defaultPrompt)}
                        onChange={(e) => { const p = MEMORY_PRESETS.find((x) => x.id === e.target.value); if (p) setMemPrompt(p.id === "default" ? defaultPrompt : p.text); }}
                      >
                        {MEMORY_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        <option value="custom">Custom…</option>
                      </Select>
                    </div>
                    <Textarea className="font-mono text-xs" value={memPrompt} maxLength={4000} onChange={(e) => setMemPrompt(e.target.value)} placeholder="Instructions for the memory worker…" rows={5} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Keep the format rules (one fact per line · reply “NONE” if nothing).</span>
                      {defaultPrompt && memPrompt.trim() !== defaultPrompt.trim() && (
                        <button className="text-xs text-brand hover:underline" onClick={() => setMemPrompt(defaultPrompt)}>Reset to default</button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {tab === "appearance" && <AppearanceSection />}
              {tab === "security" && <PasswordSection />}
              {tab === "tokens" && <TokensSection />}
            </div>

            {/* Footer */}
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-5 py-3 sm:px-8 sm:py-4">
              <span className="text-xs text-muted-foreground">
                {profileScoped ? "Changes apply after you save." : "This section saves on its own."}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>Close</Button>
                <Button variant="brand" disabled={busy || !profileScoped} onClick={save}>{busy ? "Saving…" : "Save changes"}</Button>
              </div>
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A labelled row of choices. */
function OptionRow<T extends string>({ label, hint, value, options, onChange, cols = 4 }: {
  label: string; hint?: string; value: T; cols?: number;
  options: { id: T; label: string; note?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              aria-pressed={on}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-center transition-all duration-150",
                on ? "border-brand bg-brand/5 ring-1 ring-brand/25" : "bg-card hover:border-foreground/20"
              )}
            >
              <div className="text-xs font-medium">{o.label}</div>
              {o.note && <div className="mt-0.5 text-[0.65rem] text-muted-foreground">{o.note}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Appearance — every control applies live (each pref only re-points tokens) and
 * is saved to the account, so it follows the user to any device.
 */
function AppearanceSection() {
  const [p, setP] = useState<Prefs>(getPrefs());
  useEffect(() => onPrefs(setP), []);
  const dark = resolvedMode(p) === "dark";

  return (
    <div className="space-y-5">
      <OptionRow
        label="Theme" hint="Follow the system, or pick one." cols={3} value={p.mode}
        options={[{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }, { id: "system", label: "System" }]}
        onChange={(mode) => setPrefs({ mode })}
      />

      <div className="space-y-2">
        <div>
          <div className="text-sm font-medium">Accent</div>
          <span className="text-xs text-muted-foreground">Used for actions, links, focus rings, and highlights.</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
          {ACCENTS.map((a) => {
            const on = p.accent === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setPrefs({ accent: a.id })}
                aria-pressed={on}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all duration-150",
                  on ? "border-brand ring-1 ring-brand/25 bg-brand/5" : "bg-card hover:border-foreground/20"
                )}
              >
                <span className="h-5 w-5 shrink-0 rounded-full shadow-sm ring-1 ring-inset ring-black/10"
                  style={{ background: dark ? a.dark : a.light }} />
                <span className="flex-1 truncate text-xs font-medium">{a.label}</span>
                {on && <CheckIcon size={13} className="shrink-0 text-brand" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <div className="text-sm font-medium">Gradient</div>
          <span className="text-xs text-muted-foreground">Optional duotone wash painted over accent-filled surfaces.</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
          {GRADIENTS.map((g) => {
            const on = p.gradient === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setPrefs({ gradient: g.id })}
                aria-pressed={on}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all duration-150",
                  on ? "border-brand ring-1 ring-brand/25 bg-brand/5" : "bg-card hover:border-foreground/20"
                )}
              >
                <span
                  className="h-5 w-5 shrink-0 rounded-full shadow-sm ring-1 ring-inset ring-black/10"
                  style={g.css ? { backgroundImage: g.css } : { background: "hsl(var(--muted))" }}
                />
                <span className="flex-1 truncate text-xs font-medium">{g.label}</span>
                {on && <CheckIcon size={13} className="shrink-0 text-brand" />}
              </button>
            );
          })}
        </div>
      </div>

      <OptionRow label="Typeface" hint="Applies across the whole interface." cols={4}
        value={p.font} options={FONTS} onChange={(font) => setPrefs({ font })} />

      <OptionRow label="Corners" hint="Roundness of buttons, cards, and inputs." cols={4}
        value={p.radius} options={RADII} onChange={(radius) => setPrefs({ radius })} />

      <OptionRow label="Density" hint="Scales text and spacing together." cols={3}
        value={p.density} options={DENSITIES} onChange={(density) => setPrefs({ density })} />

      <OptionRow label="Chat width" hint="How wide the message column and composer run." cols={4}
        value={p.chat_width} options={CHAT_WIDTHS} onChange={(chat_width) => setPrefs({ chat_width })} />

      <label className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 shadow-sm">
        <span>
          <span className="text-sm font-medium">Reduce motion</span>
          <span className="block text-xs text-muted-foreground">Turn off entrance animations and transitions.</span>
        </span>
        <Switch checked={p.reduce_motion} onCheckedChange={(reduce_motion) => setPrefs({ reduce_motion })} />
      </label>

      {/* Live preview — the accent's real roles, in the chosen font and corners */}
      <div className="space-y-2.5 rounded-xl border bg-muted/30 p-4">
        <div className="text-sm font-medium">Preview</div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="brand" size="sm">Primary action</Button>
          <Button variant="outline" size="sm">Secondary</Button>
          <Badge variant="brand">Badge</Badge>
          <a className="text-sm font-medium text-brand hover:underline" href="#" onClick={(e) => e.preventDefault()}>A link</a>
          <Input className="h-8 w-40" placeholder="Focus me →" />
        </div>
      </div>

      <SectionHint>Applies instantly and is saved to your account — it follows you to any device.</SectionHint>
    </div>
  );
}

function PasswordSection() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setMsg(null);
    if (next.length < 6) return setMsg({ ok: false, text: "New password must be at least 6 characters." });
    if (next !== confirm) return setMsg({ ok: false, text: "New passwords don't match." });
    setBusy(true);
    try {
      await api.changePassword(cur, next);
      setCur(""); setNext(""); setConfirm("");
      setMsg({ ok: true, text: "Password changed." });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message?.includes("400") ? "Current password is incorrect." : "Could not change password." });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <Input type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input type="password" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} />
        <Input type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {msg && (
        <div className={cn("rounded-lg border px-3 py-2 text-sm", msg.ok ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive")}>
          {msg.text}
        </div>
      )}
      <Button variant="secondary" size="sm" disabled={busy || !cur || !next} onClick={submit}>
        {busy ? "Changing…" : "Change password"}
      </Button>
    </div>
  );
}

// Built-in extraction-prompt presets. "default" mirrors the backend prompt
// (resolved at runtime); the rest are ready-made alternatives the user can pick.
const FORMAT = "\nRules:\n- One durable fact per line, third person, under 120 characters.\n- No bullets, numbering, or commentary.\n- Ignore questions and anything ephemeral.\n- If nothing is worth remembering, reply with exactly: NONE\n\nUser message:";
const MEMORY_PRESETS = [
  { id: "default", label: "Balanced (default)", text: "" },
  { id: "more", label: "Remember more", text:
    "You maintain long-term memory for an AI assistant. From the user message below, extract every durable fact worth remembering across future conversations — name, role, preferences, tools, projects, goals, opinions, and relationships." + FORMAT },
  { id: "minimal", label: "Only essentials", text:
    "You maintain long-term memory for an AI assistant. From the user message below, extract only critical, long-lived facts about the user — their name, role, and hard constraints. Prefer NONE over trivia." + FORMAT },
  { id: "work", label: "Work & projects", text:
    "You maintain long-term memory for an AI assistant. From the user message below, extract durable professional context — the user's role, team, tech stack, current projects, and work goals. Ignore personal trivia." + FORMAT },
];
function matchPreset(text: string, def: string): string {
  if (!text.trim() || text.trim() === def.trim()) return "default";
  const p = MEMORY_PRESETS.find((x) => x.text && x.text.trim() === text.trim());
  return p ? p.id : "custom";
}

function MemNum({ label, hint, value, min, max, onChange }: {
  label: string; hint: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-8 items-end text-xs leading-tight text-muted-foreground">
        <span>{label} <span className="text-muted-foreground/70">· {hint}</span></span>
      </div>
      <Input type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} />
    </div>
  );
}

const EXPIRY_CHOICES = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

function TokensSection() {
  const [tokens, setTokens] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [days, setDays] = useState(90);
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null); // plaintext shown once
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const refresh = () => api.tokens().then(setTokens).catch(() => {});
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (creating) return;
    setCreating(true); setError("");
    try {
      const t = await api.createToken({ name: name.trim() || "Access token", expires_in_days: days });
      setFresh(t.token); setCopied(false); setName("");
      refresh();
    } catch (e: any) {
      setError(e?.message?.includes("409") ? "You already have 3 active tokens — revoke one first." : "Could not create token.");
    } finally { setCreating(false); }
  }

  function copyFresh() {
    if (fresh) navigator.clipboard?.writeText(fresh).then(() => setCopied(true));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Use a token as a Bearer credential for the API, CLI, or any <b>OpenAI SDK</b> — point <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">base_url</code> at <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{API_BASE}/v1</code> and use the token as the API key. Max 3 active · default 90 days · shown once.
      </p>

      {fresh && (
        <div className="space-y-2 rounded-lg border border-brand/30 bg-brand/5 p-3.5">
          <div className="text-sm font-medium">Copy your new token now — you won't see it again.</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-2.5 py-1.5 font-mono text-xs">{fresh}</code>
            <Button variant="secondary" size="sm" onClick={copyFresh}><CopyIcon size={14} /> {copied ? "Copied" : "Copy"}</Button>
          </div>
          <button className="text-xs text-brand hover:underline" onClick={() => setFresh(null)}>Done</button>
        </div>
      )}

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <div className="flex gap-2">
        <Input placeholder="Token name (e.g. CI server)" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-32">
          {EXPIRY_CHOICES.map((c) => <option key={c.days} value={c.days}>{c.label}</option>)}
        </Select>
        <Button variant="secondary" size="sm" disabled={creating} onClick={create} className="shrink-0"><PlusIcon size={15} /> Generate</Button>
      </div>

      <div className="space-y-2">
        {tokens.map((t) => <TokenRow key={t.id} t={t} refresh={refresh} />)}
        {tokens.length === 0 && <p className="text-sm text-muted-foreground">No tokens yet.</p>}
      </div>
    </div>
  );
}

function TokenRow({ t, refresh }: { t: any; refresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.name);

  async function saveName() {
    setEditing(false);
    if (name.trim() && name.trim() !== t.name) await api.renameToken(t.id, name.trim()).then(refresh);
    else setName(t.name);
  }

  const statusVariant = t.status === "active" ? "success" : t.status === "revoked" ? "destructive" : "muted";

  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-lg border bg-card px-3 py-2.5", t.status !== "active" && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {editing ? (
            <Input className="h-7 w-40" value={name} autoFocus maxLength={80}
              onChange={(e) => setName(e.target.value)} onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setName(t.name); setEditing(false); } }} />
          ) : (
            <button className="text-sm font-medium hover:text-brand" title="Rename" onClick={() => setEditing(true)}>{t.name}</button>
          )}
          <Badge variant={statusVariant as any}>{t.status}</Badge>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          <code className="font-mono">{t.token_hint}</code>
          <span> · expires {new Date(t.expires_at).toLocaleDateString()}</span>
          <span> · {t.last_used_at ? "used " + new Date(t.last_used_at).toLocaleDateString() : "never used"}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {t.status === "active" && (
          <button className="text-xs text-muted-foreground hover:text-foreground" title="Revoke (invalidate, keep record)" onClick={() => api.revokeToken(t.id).then(refresh)}>Revoke</button>
        )}
        <button className="rounded p-1 text-muted-foreground hover:text-destructive" title="Delete permanently" onClick={() => api.deleteToken(t.id).then(refresh)}><TrashIcon size={15} /></button>
      </div>
    </div>
  );
}
