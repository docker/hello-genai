import { useEffect, useRef, useState } from "react";
import { api, onActivity, onNotify } from "../api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { PlusIcon, SparklesIcon, TrashIcon } from "./icons";

export function MemoryModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [flash, setFlash] = useState(false);
  const countRef = useRef(0);

  const refresh = () => api.memories().then((m) => {
    if (countRef.current && m.length > countRef.current) { setFlash(true); setTimeout(() => setFlash(false), 1200); }
    countRef.current = m.length;
    setItems(m);
  }).catch(() => {});

  // Live: poll while open, refetch after each reply, and when a memory is added.
  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 4000);
    const offA = onActivity(() => setTimeout(refresh, 800));
    const offN = onNotify((n) => n.kind === "memory" && refresh());
    return () => { clearInterval(poll); offA(); offN(); };
  }, []);

  async function add() {
    if (!input.trim()) return;
    await api.createMemory(input.trim());
    setInput("");
    refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <SparklesIcon size={18} className="text-brand" /> Memory
            {items.length > 0 && <Badge variant="muted">{items.length}</Badge>}
            <span className="flex items-center gap-1.5 text-xs font-normal text-success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> Live
            </span>
          </DialogTitle>
          <DialogDescription>Durable facts recalled across your conversations via pgvector semantic search.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input placeholder="Add something to remember…" value={input}
            onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button variant="brand" disabled={!input.trim()} onClick={add}><PlusIcon size={16} /> Add</Button>
        </div>

        <div className={cn("-mx-1 max-h-[46vh] space-y-1.5 overflow-y-auto px-1 scrollbar-thin transition-colors", flash && "rounded-lg bg-success/5")}>
          {items.map((m) => (
            <div key={m.id} className="group flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <span className="flex-1">{m.content}</span>
              <button
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                title="Delete"
                onClick={() => api.deleteMemory(m.id).then(refresh)}
              >
                <TrashIcon size={15} />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground"><SparklesIcon size={22} /></span>
              <p className="text-sm text-muted-foreground">Nothing remembered yet. Chat away — or add a fact above.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
