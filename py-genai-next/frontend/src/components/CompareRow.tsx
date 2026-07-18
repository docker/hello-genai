import { useState } from "react";
import { diffSides, DiffPart } from "../diff";
import { cn } from "../lib/utils";
import { MarkdownView } from "./MarkdownView";
import { Badge } from "./ui/badge";
import { BotIcon, ColumnsIcon } from "./icons";

export type Side = { model: string; content: string; usage?: { total_tokens?: number } | null };

const short = (m: string) => m.split("/").pop() || m;
const stripThink = (s: string) => s.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();

// Inline side-by-side comparison of two model answers (py-genai style):
// the primary is saved to history, the secondary is ephemeral. A Diff toggle
// shows a two-sided word diff — deletions on the left, additions on the right.
export function CompareRow({ primary, secondary, streaming }: { primary: Side; secondary: Side; streaming?: boolean }) {
  const [diff, setDiff] = useState(false);
  const canDiff = !streaming && !!primary.content && !!secondary.content;
  const sides = canDiff && diff ? diffSides(stripThink(primary.content), stripThink(secondary.content)) : null;

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-sm">
        <BotIcon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ColumnsIcon size={14} /> Comparing models
          </span>
          {canDiff && (
            <button
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
                diff ? "border-brand/50 bg-brand/10 text-brand" : "text-muted-foreground hover:bg-secondary"
              )}
              onClick={() => setDiff((d) => !d)}
            >
              {diff ? "Hide diff" : "Diff"}
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Column side={primary} tag="saved" tagVariant="success" parts={sides?.left} streaming={streaming} />
          <Column side={secondary} tag="not saved" tagVariant="muted" parts={sides?.right} streaming={streaming} />
        </div>
      </div>
    </div>
  );
}

function Column({ side, tag, tagVariant, parts, streaming }:
  { side: Side; tag: string; tagVariant: "success" | "muted"; parts?: DiffPart[] | null; streaming?: boolean }) {
  const total = side.usage?.total_tokens || 0;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Badge variant="muted" className="font-mono text-[0.65rem]">{short(side.model)}</Badge>
        <Badge variant={tagVariant} className="text-[0.65rem]">{tag}</Badge>
        {total > 0 && <span className="text-xs text-muted-foreground">{total.toLocaleString()} tok</span>}
      </div>
      {parts ? (
        <div className="whitespace-pre-wrap break-words rounded-xl border bg-card px-3.5 py-2.5 text-sm leading-7">
          {parts.map((p, i) => (
            <span key={i} className={p.type === "add" ? "rounded bg-success/15 text-success" : p.type === "del" ? "rounded bg-destructive/15 text-destructive line-through" : ""}>{p.text}</span>
          ))}
        </div>
      ) : (
        <MarkdownView className="prose-chat rounded-xl border bg-card px-3.5 py-2.5" content={side.content || (streaming ? "▍" : "")} enhance={!streaming} />
      )}
    </div>
  );
}
