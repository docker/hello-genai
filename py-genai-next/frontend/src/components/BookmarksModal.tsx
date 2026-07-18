import { useEffect, useState } from "react";
import { api } from "../api";
import { MarkdownView } from "./MarkdownView";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { BookmarkIcon, MessageIcon, TrashIcon } from "./icons";

/** B7 — every message you starred, newest first. Click one to jump to its chat. */
export function BookmarksModal({ onOpenSession, onClose }: {
  onOpenSession: (sessionId: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<any[] | null>(null);

  const refresh = () => api.bookmarks().then(setItems).catch(() => setItems([]));
  useEffect(() => { refresh(); }, []);

  async function unstar(id: number) {
    setItems((xs) => (xs || []).filter((x) => x.id !== id));   // optimistic
    try { await api.bookmark(id); } catch { refresh(); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkIcon size={18} /> Starred messages
            {!!items?.length && <Badge variant="muted">{items.length}</Badge>}
          </DialogTitle>
        </DialogHeader>

        {items === null ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-brand" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-center">
            <BookmarkIcon size={26} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing starred yet — hover any message and hit the bookmark icon.
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto scrollbar-thin">
            {items.map((m) => (
              <div key={m.id} className="group rounded-xl border bg-card p-3.5 transition-colors hover:border-foreground/20">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={m.role === "user" ? "secondary" : "muted"}>{m.role}</Badge>
                    <span className="truncate">{m.session_title || "Conversation"}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {m.session_id && (
                      <button
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        title="Open this conversation"
                        onClick={() => { onOpenSession(m.session_id); onClose(); }}
                      >
                        <MessageIcon size={15} />
                      </button>
                    )}
                    <button
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      title="Remove star"
                      onClick={() => unstar(m.id)}
                    >
                      <TrashIcon size={15} />
                    </button>
                  </span>
                </div>
                <MarkdownView className="prose-chat line-clamp-6 text-sm" content={m.content || ""} enhance={false} />
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
