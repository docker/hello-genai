import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { api, setToken } from "../api";
import { PREVIEW_URL, openPreview } from "../lib/openPreview";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  ActivityIcon,
  ArrowUpIcon,
  BotIcon,
  LayersIcon,
  SparklesIcon,
} from "./icons";

const HIGHLIGHTS = [
  { icon: SparklesIcon, title: "Persistent memory", desc: "Recalls durable facts across every conversation via pgvector." },
  { icon: LayersIcon, title: "Projects & knowledge", desc: "Organize chats and ground answers in your own documents." },
  { icon: ActivityIcon, title: "Live analytics", desc: "Token usage, activity and model stats update in real time." },
];

export function Login({ onAuthed }: { onAuthed: (u: any) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [allowReg, setAllowReg] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.config().then((c) => setAllowReg(c.allow_registration)).catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = mode === "register" ? { email, password, display_name: name } : { email, password };
      const { access_token } = mode === "register" ? await api.register(body) : await api.login(body);
      setToken(access_token);
      onAuthed(await api.me());
    } catch {
      setError(mode === "register" ? "Could not register (email may be taken)." : "Incorrect email or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full w-full lg:grid-cols-2">
      {/* Brand / hero panel */}
      <div className="grain relative hidden overflow-hidden bg-[#0a0f1c] text-zinc-100 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="mesh-bg absolute inset-0 opacity-90" />
        <div className="grid-fade absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#0a0f1c] to-transparent" />
        <div className="relative flex animate-reveal items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15 shadow-lg">
            <BotIcon size={19} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Hello-GenAI</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="animate-reveal text-[2.1rem] font-semibold leading-[1.12] tracking-heading">
            A private, self-hosted AI workspace that <span className="text-brand">remembers</span>.
          </h2>
          <p className="mt-4 animate-reveal text-[0.95rem] leading-relaxed text-zinc-400" style={{ animationDelay: "0.08s" }}>
            Chat with local models, compare them side by side, and build a knowledge base — all on your own infrastructure.
          </p>
          <div className="stagger mt-9 space-y-3">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3.5 shadow-sm transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.08]">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/20 text-brand ring-1 ring-brand/25">
                  <h.icon size={16} />
                </span>
                <div>
                  <div className="text-sm font-medium text-white">{h.title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-zinc-400">{h.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative animate-reveal font-mono text-[0.7rem] uppercase tracking-[0.14em] text-zinc-500" style={{ animationDelay: "0.4s" }}>FastAPI · PostgreSQL/pgvector · Redis · Celery · React</div>
      </div>

      {/* Auth form panel */}
      <div className="flex items-center justify-center bg-background p-6 sm:p-10">
        <div className="w-full max-w-sm animate-reveal">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/15 text-brand">
              <BotIcon size={26} />
            </span>
            <h1 className="mt-3 text-xl font-semibold tracking-tight">Hello-GenAI</h1>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login" ? "Sign in to continue to your workspace." : "Get started with your private AI workspace."}
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={submit}>
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Display name</Label>
                <Input id="name" placeholder="Optional" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} required onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} required minLength={6} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button variant="brand" className="w-full" disabled={busy} type="submit">
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              {!busy && <ArrowUpIcon size={15} className="rotate-90" />}
            </Button>
          </form>

          {allowReg && (
            <p className="mt-5 text-center text-sm text-muted-foreground">
              {mode === "login" ? "Don't have an account?" : "Already registered?"}{" "}
              <button
                type="button"
                className="font-medium text-brand hover:underline"
                onClick={() => { setError(""); setMode(mode === "login" ? "register" : "login"); }}
              >
                {mode === "login" ? "Create one" : "Sign in"}
              </button>
            </p>
          )}

          {/* min-h-11 = 44px: the iOS/WCAG minimum touch target (was a 17px-tall
              link that was near-impossible to tap reliably on a phone). */}
          <div className="mt-8 border-t pt-4 text-center">
            <a
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              href={PREVIEW_URL} target="_blank" rel="noopener noreferrer" onClick={openPreview}
            >
              Take a product tour <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
