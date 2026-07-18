import { FormEvent, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

// Delete-project dialog with a choice: delete its chats (default) or keep them unscoped.
export function DeleteProjectDialog({ name, onConfirm, onClose }: {
  name: string; onConfirm: (deleteChats: boolean) => void; onClose: () => void;
}) {
  const [deleteChats, setDeleteChats] = useState(true);

  const choice = (active: boolean) =>
    cn(
      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
      active ? "border-brand/50 bg-brand/5" : "hover:bg-secondary/50"
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{name}”?</DialogTitle>
          <DialogDescription>Choose what happens to the conversations in this project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className={choice(deleteChats)}>
            <input type="radio" name="delmode" className="mt-1 accent-brand" checked={deleteChats} onChange={() => setDeleteChats(true)} />
            <span>
              <b className="block">Delete all chats</b>
              <span className="text-muted-foreground">Permanently remove this project's conversations.</span>
            </span>
          </label>
          <label className={choice(!deleteChats)}>
            <input type="radio" name="delmode" className="mt-1 accent-brand" checked={!deleteChats} onChange={() => setDeleteChats(false)} />
            <span>
              <b className="block">Keep chats</b>
              <span className="text-muted-foreground">Move them to “All chats” (unscoped).</span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => { onConfirm(deleteChats); onClose(); }} autoFocus>
            {deleteChats ? "Delete project & chats" : "Delete project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Confirmation dialog (replaces window.confirm).
export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, onConfirm, onClose }: {
  title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? "destructive" : "default"} onClick={() => { onConfirm(); onClose(); }} autoFocus>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Text-input dialog (replaces window.prompt).
export function PromptDialog({ title, label, placeholder, initial = "", submitLabel = "Create", onSubmit, onClose }: {
  title: string; label?: string; placeholder?: string; initial?: string; submitLabel?: string;
  onSubmit: (value: string) => void; onClose: () => void;
}) {
  const [value, setValue] = useState(initial);

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {label && <Label>{label}</Label>}
            <Input autoFocus placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="brand" disabled={!value.trim()}>{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
