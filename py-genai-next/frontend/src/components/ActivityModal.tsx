import { useEffect, useState } from "react";
import { api, getLive, onActivity, onLive } from "../api";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { SparklesIcon } from "./icons";

const fmt = (n: number) => (n || 0).toLocaleString();

function ago(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ActivityModal({ onClose }: { onClose: () => void }) {
  const [m, setM] = useState<any>(null);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [, setTick] = useState(0);
  const [live, setLiveState] = useState(getLive());
  useEffect(() => onLive(() => setLiveState({ ...getLive() })), []);

  // Poll live metrics every 2.5s; a 1s ticker keeps the "updated Ns ago"
  // readout moving so the panel is visibly live (also refetch on tab focus).
  useEffect(() => {
    let alive = true;
    const load = () => api.liveMetrics().then((d) => { if (alive) { setM(d); setUpdatedAt(Date.now()); } }).catch(() => {});
    load();
    const poll = setInterval(load, 2500);
    const tick = setInterval(() => setTick((t) => t + 1), 1000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    const off = onActivity(load);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); document.removeEventListener("visibilitychange", onVis); off(); };
  }, []);

  const secs = updatedAt ? Math.floor((Date.now() - updatedAt) / 1000) : null;
  const updatedLabel = secs === null ? "" : secs <= 0 ? "updated just now" : `updated ${secs}s ago`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <SparklesIcon size={18} /> Live Activity
            <span className="flex items-center gap-1.5 text-xs font-normal text-success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> Live
            </span>
            <span className="text-xs font-normal text-muted-foreground">{updatedLabel}</span>
          </DialogTitle>
        </DialogHeader>

        {live.active && (
          <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
            <span>Generating on <b>{(live.model.split("/").pop()) || "model"}</b></span>
            <span className="ml-auto tabular-nums text-muted-foreground">{fmt(live.tokens)} tokens</span>
          </div>
        )}

        {!m ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-brand" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-sm font-semibold">Memory creation</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile value={fmt(m.memory.total)} label="Total memories" />
                <Tile value={fmt(m.memory.last_hour)} label="Last hour" accent />
                <Tile value={fmt(m.memory.last_24h)} label="Last 24h" />
                <Tile value={`${fmt(m.memory.embedded)}/${fmt(m.memory.total)}`} label="Embedded" />
              </div>
              <div className="mt-2 space-y-1">
                {m.memory.recent.length === 0 && <p className="text-sm text-muted-foreground">No memories yet — they're created automatically as you chat.</p>}
                {m.memory.recent.map((r: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/50">
                    <SparklesIcon size={13} className="shrink-0 text-brand" />
                    <span className="min-w-0 flex-1 truncate">{r.content}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ago(r.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">
                Model performance <span className="font-normal text-muted-foreground">· {fmt(m.activity.assistant_messages_last_hour)} replies last hour</span>
              </h4>
              {m.by_model.length === 0 ? <p className="text-sm text-muted-foreground">No model usage recorded yet.</p> : (
                <div className="space-y-1.5">
                  {m.by_model.map((x: any) => (
                    <div key={x.model} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
                      <span className="truncate font-medium">{x.model.split("/").pop()}</span>
                      <span className="flex flex-wrap items-center justify-end gap-x-3 text-xs text-muted-foreground">
                        <span><b className="text-foreground">{fmt(x.messages)}</b> msgs</span>
                        <span><b className="text-foreground">{fmt(x.total_tokens)}</b> tok</span>
                        <span><b className="text-foreground">{fmt(x.avg_tokens)}</b> avg/msg</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Tile({ value, label, accent }: { value: any; label: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className={cn("text-xl font-semibold tabular-nums", accent && "text-brand")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
