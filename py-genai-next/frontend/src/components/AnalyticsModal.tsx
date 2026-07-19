import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, getLive, onActivity, onLive } from "../api";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { ChartIcon, MessageIcon, SparklesIcon, ThumbsDownIcon, ThumbsUpIcon } from "./icons";

/* Dataviz method (Vega · chart color: Neutral):
   - Trend over time  → single-series AREA (2px line, ~8% wash, crosshair + tooltip; no legend).
   - Compare magnitude → ranked HORIZONTAL BARS, one neutral hue, 24px cap, 4px rounded
     data-end, 2px surface gaps, tip labels, hover lift; Chart/Table toggle for the table view.
   - Marks wear the foreground (neutral) hue; text wears text tokens; status = success/destructive + icon.
   Colors come from theme tokens so light & dark are each *selected* (validated ≥3:1 both modes). */

const RANGES = [7, 30, 90];

export function AnalyticsModal({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [days, setDays] = useState(30);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [board, setBoard] = useState<any[]>([]);   // B10 — arena leaderboard
  const [live, setLiveState] = useState(getLive());
  useEffect(() => onLive(() => setLiveState({ ...getLive() })), []);
  useEffect(() => { api.timeseries(days).then((r) => setSeries(r.days || [])).catch(() => {}); }, [days]);
  useEffect(() => { api.arenaLeaderboard().then((r) => setBoard(r.results || [])).catch(() => {}); }, []);

  // Auto-refresh: immediately, then poll every 4s while open, and on tab focus.
  useEffect(() => {
    let alive = true;
    const load = () => {
      api.stats().then((s) => { if (alive) setStats(s); }).catch(() => {});
      api.timeseries(days).then((r) => { if (alive) setSeries(r.days || []); }).catch(() => {});
    };
    load();
    const id = setInterval(load, 4000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    const off = onActivity(load);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); off(); };
  }, [days]);

  const models = stats?.by_model ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChartIcon size={18} /> Usage &amp; Analytics
            <span className="ml-1 inline-flex items-center gap-1.5 text-xs font-normal text-success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> Live
            </span>
          </DialogTitle>
        </DialogHeader>

        {!stats ? (
          <div className="flex min-h-[460px] items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-brand" />
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-5">
            {/* Hero figure — the one number the dashboard leads with */}
            <div>
              <div className="text-sm text-muted-foreground">Total tokens used</div>
              <div className={cn("mt-0.5 text-4xl font-semibold leading-none tracking-tight transition-colors sm:text-5xl", live.active && "text-brand")}>
                {fmt(stats.total_tokens + (live.active ? live.tokens : 0))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:gap-x-4 sm:text-sm">
                <span><b className="font-semibold text-foreground">{fmt(stats.prompt_tokens)}</b> prompt</span>
                <span><b className="font-semibold text-foreground">{fmt(stats.completion_tokens + (live.active ? live.tokens : 0))}</b> completion</span>
                {stats.cost_usd > 0 && <span><b className="font-semibold text-foreground">${stats.cost_usd.toFixed(2)}</b> cost</span>}
                {live.active && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-xs text-success">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> generating +{fmt(live.tokens)}{live.tps ? ` · ${live.tps.toFixed(1)} tok/s` : ""}
                  </span>
                )}
              </div>
            </div>

            {/* B14 — activity streaks from the daily rollup */}
            {series.length > 0 && <Streaks series={series} />}

            {/* KPI row */}
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              <StatTile icon={<MessageIcon size={15} />} label="Conversations" value={stats.total_sessions} />
              <StatTile icon={<SparklesIcon size={15} />} label="Messages" value={stats.total_messages} />
              <StatTile icon={<ThumbsUpIcon size={15} />} label="Rated up" value={sumBy(models, "up")} accent="up" />
              <StatTile icon={<ThumbsDownIcon size={15} />} label="Rated down" value={sumBy(models, "down")} accent="down" />
            </div>

            {/* Trend — single series, its own range control */}
            <section className="rounded-xl border bg-card p-3 sm:p-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Tokens over time</h4>
                <Segmented<number> value={days} onChange={setDays} options={RANGES.map((d) => ({ value: d, label: `${d}d` }))} />
              </div>
              <p className="mb-2 text-xs text-muted-foreground">Daily total tokens · last {days} days</p>
              {series.length > 1
                ? <AreaChart series={series} />
                : <p className="py-10 text-center text-sm text-muted-foreground">Not enough history yet — chat a bit and this fills in.</p>}
            </section>

            {/* Compare magnitude — ranked bars + table view */}
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold">Tokens by model</h4>
                <Segmented<"chart" | "table">
                  value={view}
                  onChange={setView}
                  options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]}
                />
              </div>
              {models.length === 0 ? (
                <p className="text-sm text-muted-foreground">No model usage recorded yet.</p>
              ) : view === "chart" ? (
                <ModelBars models={models} />
              ) : (
                <ModelTable models={models} />
              )}
            </section>

            {/* B10 — arena leaderboard. Absent until you have voted, so it never
                shows an empty table. */}
            {board.length > 0 && (
              <section>
                <h4 className="mb-2 text-sm font-semibold">Blind arena leaderboard</h4>
                <div className="space-y-1.5">
                  {board.map((m, i) => (
                    <div key={m.model} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
                      <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{m.model.split("/").pop()}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {m.wins}W · {m.losses}L{m.ties ? ` · ${m.ties}T` : ""}
                      </span>
                      <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                        {Math.round(m.win_rate * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Win rate from blind head-to-heads in Compare · ties count as half a win.
                </p>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── B14: streaks ─────────────────────────────────────────────────────────── */
function Streaks({ series }: { series: any[] }) {
  const days = new Set(series.filter((d) => (d.messages || 0) > 0).map((d) => d.day));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();

  // Current streak counts back from today (a gap today is forgiven until tomorrow).
  let current = 0;
  for (let i = 0; ; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    if (days.has(iso(d))) current++;
    else if (i > 0) break;                 // yesterday-onward gap ends the run
  }
  // Longest run anywhere in the window.
  const sorted = [...days].sort();
  let longest = 0, run = 0, prev: string | null = null;
  for (const d of sorted) {
    if (prev) {
      const gap = (Date.parse(d) - Date.parse(prev)) / 86400000;
      run = gap === 1 ? run + 1 : 1;
    } else run = 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <StatTile icon={<SparklesIcon size={15} />} label="Current streak" value={`${current}d`} accent={current > 0 ? "up" : undefined} />
      <StatTile icon={<ChartIcon size={15} />} label="Longest streak" value={`${longest}d`} />
      <StatTile icon={<MessageIcon size={15} />} label="Active days" value={days.size} />
    </div>
  );
}

/* ── Stat tile ─────────────────────────────────────────────────────────────── */
function StatTile({ icon, label, value, accent }: { icon: ReactNode; label: string; value: any; accent?: "up" | "down" }) {
  return (
    <div className="rounded-xl border bg-card p-2.5 sm:p-3.5">
      <div className={cn(
        "mb-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:mb-2 sm:h-7 sm:w-7",
        accent === "up" && "bg-success/10 text-success",
        accent === "down" && "bg-destructive/10 text-destructive",
      )}>
        {icon}
      </div>
      <div className="text-lg font-semibold leading-none sm:text-2xl">{typeof value === "number" ? fmt(value) : value}</div>
      <div className="mt-1 text-[0.65rem] leading-tight text-muted-foreground sm:text-xs">{label}</div>
    </div>
  );
}

/* ── Segmented control (range / view toggle) ───────────────────────────────── */
function Segmented<T extends string | number>({ value, onChange, options }:
  { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Area chart: single neutral series, crosshair + tooltip ────────────────── */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    setW(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function AreaChart({ series }: { series: any[] }) {
  const [ref, w] = useWidth();
  const [hi, setHi] = useState<number | null>(null);

  const narrow = w < 480;                       // phone-width plot
  const H = narrow ? 140 : 168, PL = narrow ? 30 : 44, PR = narrow ? 8 : 14, PT = 12, PB = 22;
  const iw = Math.max(10, w - PL - PR), ih = H - PT - PB;
  const vals = series.map((d) => d.total_tokens || 0);
  const niceMax = niceNum(Math.max(1, ...vals));
  const n = series.length;
  const x = (i: number) => PL + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v: number) => PT + ih - (v / niceMax) * ih;

  const linePts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const areaPts = `${x(0)},${PT + ih} ${linePts} ${x(n - 1)},${PT + ih}`;
  const ticks = [0, niceMax / 2, niceMax];
  const maxIdx = vals.indexOf(Math.max(...vals));
  const lastIdx = n - 1;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const i = Math.round(((px - PL) / iw) * (n - 1));
    setHi(Math.max(0, Math.min(n - 1, i)));
  }

  const labelIdx = new Set([0, Math.floor((n - 1) / 2), n - 1]);

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: H }}>
      <svg
        width={w} height={H} className="block touch-none"
        onPointerMove={onMove} onPointerLeave={() => setHi(null)}
      >
        {/* gridlines + y ticks (carry the unlabeled values) */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PL} x2={w - PR} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeWidth={1} />
            <text x={PL - 6} y={y(t) + 3} textAnchor="end" className="tabular-nums" fontSize={narrow ? 9 : 10} fill="hsl(var(--muted-foreground))">
              {fmtCompact(t)}
            </text>
          </g>
        ))}
        {/* x labels */}
        {series.map((d, i) => labelIdx.has(i) && (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            fontSize={narrow ? 9 : 10} fill="hsl(var(--muted-foreground))">{fmtDay(d.day)}</text>
        ))}
        {/* area wash + line */}
        <polygon points={areaPts} fill="hsl(var(--foreground) / 0.08)" />
        <polyline points={linePts} fill="none" stroke="hsl(var(--foreground))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* endpoint + peak markers with a 2px surface ring */}
        {[maxIdx, lastIdx].map((i, k) => (
          <circle key={k} cx={x(i)} cy={y(vals[i])} r={3.5} fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth={2} />
        ))}
        {/* last-value direct label */}
        <text x={x(lastIdx)} y={y(vals[lastIdx]) - 9} textAnchor="end" fontSize={11} fontWeight={600} fill="hsl(var(--foreground))">
          {fmtCompact(vals[lastIdx])}
        </text>
        {/* crosshair */}
        {hi != null && (
          <g pointerEvents="none">
            <line x1={x(hi)} x2={x(hi)} y1={PT} y2={PT + ih} stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hi)} cy={y(vals[hi])} r={4} fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hi != null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md"
          style={{ left: clamp(x(hi), 60, w - 60), top: y(vals[hi]) - 8 }}
        >
          <div className="text-sm font-semibold tabular-nums leading-tight">{fmt(vals[hi])}</div>
          <div className="text-[0.7rem] text-muted-foreground">{fmtDay(series[hi].day, true)}</div>
        </div>
      )}
    </div>
  );
}

/* ── Ranked horizontal bars: one neutral hue, tip labels, hover ────────────── */
function ModelBars({ models }: { models: any[] }) {
  const [hi, setHi] = useState<number | null>(null);
  const max = Math.max(1, ...models.map((m) => m.total_tokens || 0));
  return (
    <div className="space-y-0.5">
      {models.map((m, i) => {
        const pct = Math.max(2, ((m.total_tokens || 0) / max) * 100);
        const inside = pct > 78;
        return (
          <div
            key={m.model}
            className="group flex items-center gap-3 rounded-md px-1 py-1 hover:bg-secondary/50"
            onPointerEnter={() => setHi(i)} onPointerLeave={() => setHi((h) => (h === i ? null : h))}
          >
            <span className="w-16 shrink-0 truncate text-right text-[0.7rem] font-medium sm:w-28 sm:text-xs" title={m.model}>{short(m.model)}</span>
            <div className="relative h-6 flex-1">
              <div
                className="absolute inset-y-0 left-0 rounded-r-[4px] bg-foreground/90 transition-[filter] group-hover:brightness-110"
                style={{ width: `${pct}%` }}
              />
              <span
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 text-[0.7rem] font-semibold tabular-nums",
                  inside ? "text-background" : "text-muted-foreground",
                )}
                style={inside ? { right: `calc(${100 - pct}% + 6px)` } : { left: `calc(${pct}% + 6px)` }}
              >
                {fmtCompact(m.total_tokens || 0)}
              </span>
              {hi === i && (
                <div className="pointer-events-none absolute bottom-full left-2 z-10 mb-1 whitespace-nowrap rounded-lg border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md">
                  <div className="text-sm font-semibold tabular-nums leading-tight">{fmt(m.total_tokens || 0)} tokens</div>
                  <div className="text-[0.7rem] text-muted-foreground">
                    {m.messages} msg · {m.avg_latency_ms ? `${(m.avg_latency_ms / 1000).toFixed(1)}s avg` : "—"}
                    {m.cost_usd > 0 ? ` · $${m.cost_usd.toFixed(2)}` : ""}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Table view (accessibility fallback — every value without hover) ───────── */
function ModelTable({ models }: { models: any[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border scrollbar-thin">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium normal-case">Model</th>
            <th className="px-3 py-2 text-right font-medium">Msgs</th>
            <th className="px-3 py-2 text-right font-medium">Tokens</th>
            <th className="px-3 py-2 text-right font-medium">Avg</th>
            <th className="px-3 py-2 text-right font-medium">Cost</th>
            <th className="px-3 py-2 text-right font-medium">Rating</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.model} className="border-t">
              <td className="px-3 py-2 text-left font-medium" title={m.model}>{short(m.model)}</td>
              <td className="px-3 py-2 text-right">{fmt(m.messages)}</td>
              <td className="px-3 py-2 text-right">{fmt(m.total_tokens)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{m.avg_latency_ms ? `${(m.avg_latency_ms / 1000).toFixed(1)}s` : "—"}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{m.cost_usd > 0 ? `$${m.cost_usd.toFixed(2)}` : "—"}</td>
              <td className="px-3 py-2 text-right">
                <span className="inline-flex items-center justify-end gap-2">
                  {m.up > 0 && <span className="inline-flex items-center gap-1 text-success"><ThumbsUpIcon size={12} /> {m.up}</span>}
                  {m.down > 0 && <span className="inline-flex items-center gap-1 text-destructive"><ThumbsDownIcon size={12} /> {m.down}</span>}
                  {!m.up && !m.down && <span className="text-muted-foreground">—</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── helpers ───────────────────────────────────────────────────────────────── */
function sumBy(rows: any[], key: string) { return (rows || []).reduce((n, r) => n + (r[key] || 0), 0); }
function fmt(n: number) { return (n || 0).toLocaleString(); }
function short(m: string) { return m.split("/").pop() || m; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function fmtCompact(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(n));
}
function fmtDay(iso: string, full = false) {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, full ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
}
function niceNum(x: number) {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}
