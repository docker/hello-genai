import { useEffect, useState } from "react";
import { api } from "../api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Select } from "./ui/select";
import { Switch } from "./ui/switch";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { CheckIcon, ClockIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";

const INTERVALS = [
  { label: "Hourly", h: 1 }, { label: "Every 6 hours", h: 6 },
  { label: "Every 12 hours", h: 12 }, { label: "Daily", h: 24 },
  { label: "Every 3 days", h: 72 }, { label: "Weekly", h: 168 },
];
const intervalLabel = (h: number) => INTERVALS.find((i) => i.h === h)?.label || `every ${h}h`;

export function ScheduledModal({ models, onRan, onClose }: { models: string[]; onRan?: () => void; onClose: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [hours, setHours] = useState(24);

  const refresh = () => api.schedules().then(setItems).catch(() => {});
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!prompt.trim()) return;
    await api.createSchedule({ name: name.trim() || "Scheduled prompt", prompt: prompt.trim(), interval_hours: hours });
    setName(""); setPrompt(""); setHours(24); refresh();
  }
  void models;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClockIcon size={18} /> Scheduled prompts</DialogTitle>
          <DialogDescription>Run a prompt automatically on a recurring schedule. Each run lands in a new conversation.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 rounded-xl border bg-muted/30 p-4">
          <div className="flex gap-2">
            <Input placeholder="Name (e.g. Morning digest)" value={name} onChange={(e) => setName(e.target.value)} />
            <Select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-44">
              {INTERVALS.map((i) => <option key={i.h} value={i.h}>{i.label}</option>)}
            </Select>
          </div>
          <Textarea placeholder="Prompt to run each time…" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
          <div className="flex justify-end">
            <Button variant="brand" size="sm" disabled={!prompt.trim()} onClick={create}><PlusIcon size={15} /> Add schedule</Button>
          </div>
        </div>

        <div className="space-y-2">
          {items.map((s) => <ScheduleCard key={s.id} s={s} refresh={refresh} onRan={onRan} />)}
          {items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No schedules yet — add one above.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleCard({ s, refresh, onRan }: { s: any; refresh: () => void; onRan?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  const [prompt, setPrompt] = useState(s.prompt);
  const [hours, setHours] = useState(s.interval_hours);
  const [running, setRunning] = useState(false);

  async function save() {
    await api.patchSchedule(s.id, { name: name.trim() || s.name, prompt: prompt.trim() || s.prompt, interval_hours: hours }).catch(() => {});
    setEditing(false);
    refresh();
  }
  function cancel() {
    setName(s.name); setPrompt(s.prompt); setHours(s.interval_hours); setEditing(false);
  }
  async function runNow() {
    setRunning(true);
    await api.runSchedule(s.id).catch(() => {});
    setTimeout(() => { setRunning(false); refresh(); onRan?.(); }, 3000);
  }

  if (editing) {
    return (
      <div className="space-y-2.5 rounded-xl border border-brand/40 bg-card p-4">
        <div className="flex gap-2">
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-44">
            {INTERVALS.map((i) => <option key={i.h} value={i.h}>{i.label}</option>)}
          </Select>
        </div>
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Prompt" rows={3} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
          <Button variant="brand" size="sm" onClick={save}><CheckIcon size={15} /> Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-3 rounded-xl border bg-card p-3.5", !s.enabled && "opacity-60")}>
      <div className="pt-0.5">
        <Switch checked={s.enabled} onCheckedChange={(v) => api.patchSchedule(s.id, { enabled: v }).then(refresh)} title={s.enabled ? "Enabled" : "Paused"} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{s.name}</div>
        <div className="truncate text-sm text-muted-foreground">{s.prompt}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="gap-1"><ClockIcon size={12} /> {intervalLabel(s.interval_hours)}</Badge>
          <span>next {new Date(s.next_run).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          {s.last_run && <span>· last {new Date(s.last_run).toLocaleDateString()}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="secondary" size="sm" disabled={running} onClick={runNow}>{running ? "Running…" : "Run now"}</Button>
        <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => setEditing(true)}><PencilIcon size={15} /></Button>
        <Button variant="ghost" size="icon-sm" className="hover:text-destructive" title="Delete" onClick={() => api.deleteSchedule(s.id).then(refresh)}><TrashIcon size={15} /></Button>
      </div>
    </div>
  );
}
