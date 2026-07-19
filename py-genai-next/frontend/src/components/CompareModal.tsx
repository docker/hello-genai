import { useState } from "react";
import { api } from "../api";
import { wordDiff } from "../diff";
import { cn } from "../lib/utils";
import { Composer } from "./Composer";
import { MarkdownView } from "./MarkdownView";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { ColumnsIcon } from "./icons";

type Result = { model: string; loading: boolean; response?: string; error?: string; total?: number };

const short = (m: string) => m.split("/").pop() || m;
const stripThink = (s: string) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();

export function CompareModal(
  { models, defaultModel, sessionId, initialPrompt = "", onClose }:
  { models: string[]; defaultModel: string; sessionId: string | null; initialPrompt?: string; onClose: () => void },
) {
  // Preselect up to two models, starting with the current one.
  const [selected, setSelected] = useState<string[]>(() => {
    const rest = models.filter((m) => m !== defaultModel);
    return [defaultModel, rest[0]].filter(Boolean).slice(0, 2);
  });
  const [prompt, setPrompt] = useState(initialPrompt);
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  // B10 — blind arena. Names are hidden until you vote, so the judgement is about
  // the answer rather than the label on it.
  const [blind, setBlind] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [voted, setVoted] = useState<string | null>(null);

  function toggle(m: string) {
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  }

  async function run() {
    const text = prompt.trim();
    if (!text || selected.length < 2 || running) return;
    setRunning(true);
    setShowDiff(false);
    setRevealed(false);
    setVoted(null);
    setResults(selected.map((model) => ({ model, loading: true })));

    await Promise.all(
      selected.map(async (model) => {
        try {
          const r = await api.chat({
            message: text, model, session_id: sessionId || undefined, save: false,
            use_tools: false, use_memory: true, use_rag: true,
          });
          update(model, { loading: false, response: r.response, total: r.usage?.total_tokens });
        } catch {
          update(model, { loading: false, error: "Request failed" });
        }
      }),
    );
    setRunning(false);
  }

  /** index 0/1 picks a winner; -1 records a tie. */
  async function castVote(index: number) {
    if (results.length !== 2) return;
    const [a, b] = results;
    const tie = index === -1;
    const winner = tie ? a.model : results[index].model;
    const loser = tie ? b.model : results[1 - index].model;
    setRevealed(true);
    setVoted(tie ? "Tie" : short(winner));
    try {
      await api.arenaVote({ winner, loser, tie, prompt: prompt.trim().slice(0, 4000) });
    } catch { /* the reveal already happened; a lost vote is not worth blocking on */ }
  }

  function update(model: string, patch: Partial<Result>) {
    setResults((rs) => rs.map((r) => (r.model === model ? { ...r, ...patch } : r)));
  }

  const canDiff = results.length === 2 && results.every((r) => r.response);
  const diff = canDiff ? wordDiff(stripThink(results[0].response!), stripThink(results[1].response!)) : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ColumnsIcon size={18} /> Compare models</DialogTitle>
          <DialogDescription>Run the same prompt across models side by side (nothing is saved to the chat).</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {models.map((m) => (
            <button
              key={m}
              className={cn(
                "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                selected.includes(m) ? "border-brand/50 bg-brand/10 text-brand" : "text-muted-foreground hover:bg-secondary"
              )}
              onClick={() => toggle(m)}
            >
              {short(m)}
            </button>
          ))}
        </div>

        <Composer compact value={prompt} onChange={setPrompt} onSend={run} onStop={() => {}} busy={running}
          templates={[]} placeholder="Prompt to compare across models… (Enter to run, ⇧Enter for newline)" />

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{selected.length} selected{selected.length < 2 ? " · pick at least 2" : ""}</span>
          <div className="flex items-center gap-2">
            {canDiff && (
              <Button variant={showDiff ? "secondary" : "outline"} size="sm" onClick={() => setShowDiff((d) => !d)}>
                {showDiff ? "Hide diff" : "Show diff"}
              </Button>
            )}
            <Button
              variant={blind ? "secondary" : "outline"}
              size="sm"
              title="Hide which model is which until you vote"
              onClick={() => { setBlind((b) => !b); setRevealed(false); setVoted(null); }}
            >
              {blind ? "Blind: on" : "Blind mode"}
            </Button>
            <Button variant="brand" size="sm" disabled={running || prompt.trim().length === 0 || selected.length < 2} onClick={run}>
              {running ? "Running…" : "Run compare"}
            </Button>
          </div>
        </div>

        {showDiff && canDiff && (
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-2 flex gap-4 text-xs font-medium">
              <span className="text-destructive">− {blind && !revealed ? "Model A" : short(results[0].model)}</span>
              <span className="text-success">+ {blind && !revealed ? "Model B" : short(results[1].model)}</span>
            </div>
            <div className="whitespace-pre-wrap break-words text-sm leading-7">
              {diff.map((p, i) => (
                <span key={i} className={p.type === "add" ? "rounded bg-success/15 text-success" : p.type === "del" ? "rounded bg-destructive/15 text-destructive line-through" : ""}>{p.text}</span>
              ))}
            </div>
          </div>
        )}

        {blind && results.length === 2 && results.every((r) => r.response) && !voted && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 p-3">
            <span className="text-sm font-medium">Which answer is better?</span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => castVote(0)}>Model A</Button>
              <Button size="sm" variant="outline" onClick={() => castVote(1)}>Model B</Button>
              <Button size="sm" variant="ghost" onClick={() => castVote(-1)}>Tie</Button>
            </div>
          </div>
        )}
        {voted && (
          <div className="rounded-xl border border-brand/30 bg-brand/5 p-3 text-sm">
            Voted — <b>{voted}</b>. Revealed above; the leaderboard is in Usage &amp; Analytics.
          </div>
        )}

        {results.length > 0 && !showDiff && (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${results.length}, minmax(0, 1fr))` }}>
            {results.map((r) => (
              <div key={r.model} className="min-w-0 rounded-xl border bg-card p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="muted" className="font-mono text-[0.65rem]">{blind && !revealed ? `Model ${String.fromCharCode(65 + results.indexOf(r))}` : short(r.model)}</Badge>
                  {r.total ? <span className="text-xs text-muted-foreground">{r.total.toLocaleString()} tok</span> : null}
                </div>
                {r.loading ? (
                  <p className="text-sm text-muted-foreground">Generating…</p>
                ) : r.error ? (
                  <p className="text-sm text-destructive">{r.error}</p>
                ) : (
                  <MarkdownView className="prose-chat max-h-[40vh] overflow-y-auto scrollbar-thin" content={r.response || ""} enhance />
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
