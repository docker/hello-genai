import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { BookIcon, FileIcon, PlusIcon, TrashIcon } from "./icons";

export function KnowledgeModal({ projectId, onClose }: { projectId?: number | null; onClose: () => void }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [embeddings, setEmbeddings] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    api.documents(projectId || undefined).then((r) => { setDocs(r.documents); setEmbeddings(r.embeddings_available); }).catch(() => {});
  useEffect(() => { refresh(); }, [projectId]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await api.uploadDoc(file, projectId || undefined);
      setTimeout(refresh, 1500); // ingestion runs on the worker
    } catch {
      setError("Upload failed — check the file type (txt, md, pdf).");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookIcon size={18} /> Knowledge Base</DialogTitle>
          <DialogDescription>
            Documents are chunked, embedded and retrieved via pgvector RAG{projectId ? " for this project" : ""}.
          </DialogDescription>
        </DialogHeader>

        {!embeddings && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Embeddings are not configured — documents are stored but not retrieved. Set EMBED_MODEL to enable retrieval.
          </div>
        )}
        {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

        <div className="flex items-center justify-between">
          <input ref={fileRef} type="file" accept=".txt,.md,.pdf,.json,.csv" onChange={onFile} className="hidden" />
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            <PlusIcon size={16} /> {busy ? "Uploading…" : "Upload document"}
          </Button>
          <button className="text-sm text-muted-foreground hover:text-foreground" onClick={refresh}>↻ Refresh</button>
        </div>

        <div className="-mx-1 max-h-[46vh] space-y-1.5 overflow-y-auto px-1 scrollbar-thin">
          {docs.map((d) => (
            <div key={d.id} className="group flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-sm">
              <FileIcon size={16} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {d.filename}
                <span className="text-muted-foreground"> · {d.chunk_count} chunks · {statusLabel(d.status)}</span>
              </span>
              <button className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" title="Delete" onClick={() => api.deleteDocument(d.id).then(refresh)}>
                <TrashIcon size={15} />
              </button>
            </div>
          ))}
          {docs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No documents yet. Upload one to ground answers in your files.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function statusLabel(s: string) {
  return s === "ready" ? "ready" : s === "pending" ? "processing…" : s;
}
