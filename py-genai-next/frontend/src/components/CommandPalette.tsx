import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { cn } from "../lib/utils";
import { SearchIcon } from "./icons";

export type Command = { id: string; label: string; hint?: string; icon?: ReactNode; run: () => void };

export function CommandPalette(
  { commands, onOpenSession, onClose }:
  { commands: Command[]; onOpenSession: (id: string) => void; onClose: () => void },
) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [results, setResults] = useState<any[]>([]);
  // B16 - keyword is the default (it wins for exact strings and identifiers);
  // semantic finds a conversation you can describe but cannot quote.
  const [semantic, setSemantic] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounced full-text search across messages.
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(() => {
      api.search(q.trim(), semantic).then((r) => setResults(r.results || [])).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(h);
  }, [q, semantic]);

  const filteredCommands = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(t));
  }, [q, commands]);

  const searchItems: Command[] = results.map((r) => ({
    id: `search-${r.session_id}-${r.id ?? r.message_id}`,
    icon: <SearchIcon size={16} />,
    label: r.session_title || r.title || "Conversation",
    hint: ((r.snippet || "").replace(/\[\/?MARK\]/g, "")) +
          (r.similarity ? "  \u00b7  " + Math.round(r.similarity * 100) + "% match" : ""),
    run: () => onOpenSession(r.session_id),
  }));

  const items = [...filteredCommands, ...searchItems];

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); items[sel]?.run(); onClose(); }
    else if (e.key === "Escape") onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[12vh] animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-2xl animate-slide-up" onKeyDown={onKey}>
        <div className="flex items-center gap-2.5 border-b px-4">
          <SearchIcon size={17} className="text-muted-foreground" />
          <input
            ref={inputRef}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder={semantic ? "Describe what you are looking for..." : "Type a command or search conversations..."}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
          />
          {/* B16 - keyword stays the default; semantic is opt-in per search. */}
          <button
            type="button"
            aria-pressed={semantic}
            title={semantic ? "Semantic search: matching by meaning" : "Search by meaning instead of exact words"}
            onClick={() => { setSemantic((v) => !v); setSel(0); }}
            className={cn(
              "shrink-0 rounded-md border px-2 py-1 text-[0.7rem] font-medium transition-colors",
              semantic ? "border-brand/50 bg-brand/10 text-brand" : "text-muted-foreground hover:bg-secondary"
            )}
          >
            Meaning
          </button>
          <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground">esc</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-1.5 scrollbar-thin">
          {items.map((c, i) => (
            <div
              key={c.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm",
                i === sel ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60"
              )}
              onMouseEnter={() => setSel(i)}
              onClick={() => { c.run(); onClose(); }}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">{c.icon || "›"}</span>
              <span className="shrink-0 font-medium text-foreground">{c.label}</span>
              {c.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{c.hint}</span>}
            </div>
          ))}
          {items.length === 0 && <div className="px-3 py-8 text-center text-sm text-muted-foreground">No matches</div>}
        </div>
      </div>
    </div>
  );
}
