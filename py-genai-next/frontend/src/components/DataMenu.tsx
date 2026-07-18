import { useRef, useState } from "react";
import { api } from "../api";
import { Button } from "./ui/button";
import { Tip } from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ArchiveIcon, DownloadIcon, FileTextIcon, TrashIcon, UploadIcon } from "./icons";

type Props = {
  currentSessionId: string | null;
  onRefresh: () => void;
  onCleared: () => void;
};

export function DataMenu({ currentSessionId, onRefresh, onCleared }: Props) {
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function flash(msg: string) { setNote(msg); setTimeout(() => setNote(""), 3000); }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data.sessions)) {
        const r = await api.importBackup(data);
        flash(`Restored ${r.imported_sessions} conversation(s).`);
      } else if (Array.isArray(data.messages)) {
        await api.importSession(data);
        flash("Chat imported.");
      } else {
        flash("Unrecognized file — expected a chat or backup export.");
        return;
      }
      onRefresh();
    } catch {
      flash("Could not import — is it a valid JSON export?");
    }
  }

  async function clearAll() {
    if (!confirm("Delete ALL conversations? This cannot be undone. (Presets, templates and memory are kept.)")) return;
    await api.clearAllSessions();
    onCleared();
    onRefresh();
    flash("All conversations cleared.");
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImportFile} />
      <DropdownMenu>
        <Tip label="Export & import data">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Export & import data" className="text-muted-foreground hover:text-foreground">
              <ArchiveIcon size={18} />
            </Button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>This conversation</DropdownMenuLabel>
          <DropdownMenuItem disabled={!currentSessionId} onSelect={() => currentSessionId && api.exportSession(currentSessionId, "json")}>
            <DownloadIcon /> Export as JSON
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!currentSessionId} onSelect={() => currentSessionId && api.exportSession(currentSessionId, "md")}>
            <FileTextIcon /> Export as Markdown
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>All data</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => api.downloadBackup()}>
            <ArchiveIcon /> Download full backup
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
            <UploadIcon /> Import from file…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={(e) => { e.preventDefault(); clearAll(); }}>
            <TrashIcon /> Clear all conversations
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {note && (
        <div className="fixed bottom-6 right-6 z-[60] animate-slide-up rounded-lg border bg-card px-3 py-2 text-sm shadow-lg">
          {note}
        </div>
      )}
    </>
  );
}
