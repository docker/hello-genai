import { useEffect, useState } from "react";
import { api } from "../api";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { ChipIcon, GlobeIcon, InfoIcon, SparklesIcon } from "./icons";

const short = (m?: string | null) => (m ? m.split("/").pop() || m : "—");
const fmtDate = (unix?: number) => (unix ? new Date(unix * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

export function ModelInfoModal({ currentModel, onClose }: { currentModel?: string; onClose: () => void }) {
  const [info, setInfo] = useState<any>(null);
  useEffect(() => { api.modelInfo().then(setInfo).catch(() => setInfo({ models: [], runtime: {} })); }, []);

  // Prefer the model the user selected in the navbar; fall back to the backend default.
  const activeId = currentModel || info?.current;
  const current = info?.models?.find((m: any) => m.id === activeId)
    || info?.models?.find((m: any) => m.is_current)
    || info?.models?.find((m: any) => m.id === info?.current);
  const rt = info?.runtime || {};

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><InfoIcon size={18} /> Model details</DialogTitle>
        </DialogHeader>

        {!info ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-brand" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/12 text-brand"><ChipIcon size={22} /></span>
              <div className="min-w-0">
                <div className="text-lg font-semibold">{short(current?.id || info.current)}</div>
                <div className="truncate text-xs text-muted-foreground">{current?.id || info.current}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge variant="success">Active</Badge>
                  {rt.web_search_enabled && <Badge variant="secondary"><GlobeIcon size={11} /> Internet</Badge>}
                  {rt.tools_enabled && <Badge variant="secondary">Tools</Badge>}
                  {rt.embeddings_enabled && <Badge variant="secondary">RAG</Badge>}
                </div>
              </div>
            </div>

            {current && (current.parameters || current.architecture) && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Spec label="Architecture" value={current.architecture} />
                <Spec label="Parameters" value={current.parameters} />
                <Spec label="Quantization" value={current.quantization} />
                <Spec label="Size on disk" value={current.size} />
                <Spec label="Provider" value={current.owned_by} />
                <Spec label="Added" value={fmtDate(current.created)} />
              </div>
            )}

            <div>
              <h4 className="mb-2 text-sm font-semibold">Runtime</h4>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Spec label="Context window" value={rt.context_max_tokens ? `${rt.context_max_tokens.toLocaleString()} tokens` : "—"} />
                <Spec label="Max output" value={rt.max_output_tokens ? `${rt.max_output_tokens.toLocaleString()} tokens` : "—"} />
                <Spec label="Temperature" value={rt.temperature_range ? `${rt.temperature_range[0]} – ${rt.temperature_range[1]}` : "—"} />
                <Spec label="Web search" value={rt.web_search_enabled ? "Enabled" : "Off"} />
                <Spec label="Embeddings" value={short(info.embed_model)} />
                <Spec label="Function tools" value={rt.tools_enabled ? "Enabled" : "Off"} />
              </div>
            </div>

            {info.models?.length > 1 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Installed models</h4>
                <div className="space-y-1.5">
                  {info.models.map((m: any) => (
                    <div key={m.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", m.id === activeId ? "border-brand/40 bg-brand/5" : "bg-card")}>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium">{short(m.id)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {[m.parameters, m.size, m.quantization].filter(Boolean).join(" · ") || m.architecture || "—"}
                        </span>
                      </div>
                      {m.id === activeId && <Badge variant="success">current</Badge>}
                      {m.is_embedding && <Badge variant="secondary"><SparklesIcon size={11} /> embed</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Spec({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value || "—"}</div>
    </div>
  );
}
