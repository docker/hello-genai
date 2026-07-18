import { useEffect, useState } from "react";
import { api } from "../api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { CopyIcon } from "./icons";

export function ShareModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Reflect current share state from the session list if already shared.
    api.sessions().then((ss) => {
      const s = ss.find((x: any) => x.id === sessionId);
      if (s?.share_token) setToken(s.share_token);
    }).catch(() => {});
  }, [sessionId]);

  const url = token ? `${location.origin}/#/shared/${token}` : "";

  async function enable() {
    setBusy(true);
    try { const r = await api.shareSession(sessionId); setToken(r.share_token); } finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true);
    try { await api.unshareSession(sessionId); setToken(null); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share conversation</DialogTitle>
          <DialogDescription>Anyone with the link can view a read-only copy of this conversation. No sign-in required.</DialogDescription>
        </DialogHeader>
        {!token ? (
          <Button variant="brand" disabled={busy} onClick={enable}>{busy ? "Creating…" : "Create public link"}</Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-xs">{url}</code>
              <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); }}>
                <CopyIcon size={14} /> {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <button className="text-sm text-destructive hover:underline" onClick={disable}>Stop sharing</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
