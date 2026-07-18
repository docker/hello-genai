import { useEffect, useState } from "react";
import { api } from "../api";
import { BUILTIN_TEMPLATES } from "../builtinTemplates";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { LibraryIcon, PlusIcon, TrashIcon, WandIcon } from "./icons";

export function LibraryModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [presets, setPresets] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  const refresh = () => {
    api.presets().then(setPresets).catch(() => {});
    api.templates().then(setTemplates).catch(() => {});
  };
  useEffect(() => { refresh(); }, []);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><LibraryIcon size={18} /> Library</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="presets">
          <TabsList className="w-full">
            <TabsTrigger value="presets" className="flex-1">Presets</TabsTrigger>
            <TabsTrigger value="templates" className="flex-1">Slash templates</TabsTrigger>
          </TabsList>
          <TabsContent value="presets">
            <PresetsTab presets={presets} refresh={() => { refresh(); onChanged(); }} />
          </TabsContent>
          <TabsContent value="templates">
            <TemplatesTab templates={templates} refresh={() => { refresh(); onChanged(); }} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PresetsTab({ presets, refresh }: { presets: any[]; refresh: () => void }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  async function add() {
    if (!name.trim() || !text.trim()) return;
    await api.createPreset({ name: name.trim(), text: text.trim() });
    setName(""); setText(""); refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Presets are reusable system prompts — apply one to steer the assistant's persona and behavior.</p>
      <div className="space-y-2.5 rounded-xl border bg-muted/30 p-4">
        <Input placeholder="Preset name (e.g. Senior Engineer)" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea placeholder="System prompt… e.g. You are a precise senior engineer. Prefer code and concise explanations." value={text} onChange={(e) => setText(e.target.value)} rows={3} />
        <div className="flex justify-end"><Button variant="secondary" size="sm" onClick={add}><PlusIcon size={16} /> Add preset</Button></div>
      </div>
      <div className="max-h-[40vh] space-y-1.5 overflow-y-auto scrollbar-thin">
        {presets.map((p) => (
          <div key={p.id} className="group flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium"><WandIcon size={15} className="text-brand" /> {p.name}</span>
              <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.text}</span>
            </div>
            <button className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" title="Delete" onClick={() => api.deletePreset(p.id).then(refresh)}><TrashIcon size={15} /></button>
          </div>
        ))}
        {presets.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No presets yet.</p>}
      </div>
    </div>
  );
}

function TemplatesTab({ templates, refresh }: { templates: any[]; refresh: () => void }) {
  const [trigger, setTrigger] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  async function add() {
    if (!trigger.trim() || !content.trim()) return;
    await api.createTemplate({ trigger: trigger.trim(), title: title.trim(), content });
    setTrigger(""); setTitle(""); setContent(""); refresh();
  }

  const customTriggers = new Set(templates.map((t) => t.trigger));
  const activeBuiltins = BUILTIN_TEMPLATES.filter((t) => !customTriggers.has(t.trigger));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Type <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/</code> in the composer to insert a command. Built-ins are always available; add your own or override a built-in by reusing its trigger.
      </p>
      <div className="space-y-2.5 rounded-xl border bg-muted/30 p-4">
        <div className="flex gap-2">
          <Input placeholder="trigger (e.g. summarize)" value={trigger} onChange={(e) => setTrigger(e.target.value)} />
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <Textarea placeholder="Inserted text…" value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
        <div className="flex justify-end"><Button variant="secondary" size="sm" onClick={add}><PlusIcon size={16} /> Add command</Button></div>
      </div>

      <div className="max-h-[58vh] space-y-4 overflow-y-auto scrollbar-thin">
        {templates.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">Your commands <Badge variant="muted">{templates.length}</Badge></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <div key={t.id} className="group rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-brand">/{t.trigger}</span>
                    <button className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" title="Delete" onClick={() => api.deleteTemplate(t.id).then(refresh)}><TrashIcon size={14} /></button>
                  </div>
                  <div className="mt-1 text-sm font-medium">{t.title}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.content}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">Built-in commands <Badge variant="muted">{activeBuiltins.length}</Badge></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeBuiltins.map((t) => (
              <div key={t.trigger} className="rounded-lg border border-dashed bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-brand">/{t.trigger}</span>
                  <Badge variant="secondary">built-in</Badge>
                </div>
                <div className="mt-1 text-sm font-medium">{t.title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.content}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
