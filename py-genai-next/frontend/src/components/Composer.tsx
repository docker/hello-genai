import { useMemo, useRef, useState } from "react";
import { BUILTIN_TEMPLATES } from "../builtinTemplates";
import { personaAvatarUrl } from "../avatars";
import { cn } from "../lib/utils";
import { dictationAvailable, dictationSupported, startDictation } from "../lib/voice";
import { notify } from "../api";
import { MarkdownView } from "./MarkdownView";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  ArrowUpIcon, BoldIcon, CodeBlockIcon, CodeIcon, ColumnsIcon, EyeIcon, ItalicIcon,
  LinkIcon, ListIcon, MicIcon, PaperclipIcon, QuoteIcon, StopIcon, WandIcon, XIcon,
} from "./icons";

export type Template = { id: number; trigger: string; title: string; content: string };
export type Preset = { id: number; name: string; text: string };

const shortModel = (m: string) => m.split("/").pop() || m;

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  templates: Template[];
  presets?: Preset[];
  activePreset?: Preset | null;
  onApplyPreset?: (p: Preset | null) => void;
  onManageLibrary?: () => void;
  models?: string[];
  currentModel?: string;
  compareModel?: string | null;
  onCompareModel?: (m: string | null) => void;
  compact?: boolean;   // used inside modals: hides preset/compare pickers + send button
  placeholder?: string;
  /** Attached images as data URLs (vision models). Omit to hide attachment UI. */
  images?: string[];
  onImages?: (next: string[]) => void;
};

const chip = (active?: boolean) =>
  cn(
    "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
    active ? "border-brand/50 bg-brand/10 text-brand" : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
  );

const optionCls = (active?: boolean) =>
  cn(
    "flex w-full cursor-pointer items-center rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
    active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
  );

export function Composer({ value, onChange, onSend, onStop, busy, templates, presets = [], activePreset = null, onApplyPreset, onManageLibrary, models = [], currentModel = "", compareModel = null, onCompareModel, compact = false, placeholder, images, onImages }: Props) {
  const imgRef = useRef<HTMLInputElement>(null);
  const [listening, setListening] = useState(false);
  const stopDictation = useRef<null | (() => void)>(null);
  const baseText = useRef("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashSel, setSlashSel] = useState(0);
  const [presetOpen, setPresetOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);


  // B11 — dictation appends onto whatever was already typed.
  function toggleMic() {
    // Visible but explanatory when the API exists yet the page isn't secure —
    // silently hiding it just looked like a missing feature on phones.
    if (!dictationSupported()) {
      notify({
        title: "Voice input needs HTTPS",
        body: "Browsers only expose speech recognition on a secure origin. It works on localhost today; serving the app over HTTPS enables it everywhere.",
        kind: "info",
      });
      return;
    }
    if (listening) { stopDictation.current?.(); stopDictation.current = null; setListening(false); return; }
    baseText.current = value ? value.trimEnd() + " " : "";
    setListening(true);
    stopDictation.current = startDictation(
      (text) => onChange(baseText.current + text),
      () => { setListening(false); stopDictation.current = null; },
    );
  }

  /* Image attachments. Downscaled to <=1024px and re-encoded as JPEG before they
     leave the browser: raw phone photos are multi-MB and the data URL is inlined
     into the chat request. */
  const canAttach = !!onImages && !compact;
  async function addFiles(files: FileList | File[]) {
    if (!onImages) return;
    const room = 4 - (images?.length || 0);
    const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (!picked.length) return;
    const encoded = await Promise.all(picked.map(downscaleImage));
    onImages([...(images || []), ...encoded].slice(0, 4));
  }

  // The user's server templates override built-ins that share a trigger.
  const allTemplates = useMemo(() => {
    const seen = new Set(templates.map((t) => t.trigger));
    return [...templates, ...BUILTIN_TEMPLATES.filter((t) => !seen.has(t.trigger))];
  }, [templates]);

  const slashMatches = useMemo(() => {
    const q = slashQuery.toLowerCase();
    return allTemplates.filter((t) => t.trigger.includes(q) || t.title.toLowerCase().includes(q)).slice(0, 40);
  }, [allTemplates, slashQuery]);

  function autoGrow(ta: HTMLTextAreaElement) {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }

  function detectSlash(ta: HTMLTextAreaElement) {
    const before = ta.value.slice(0, ta.selectionStart);
    const m = before.match(/(?:^|\s)\/([^\s/]*)$/);
    if (m) { setSlashQuery(m[1]); setSlashOpen(true); setSlashSel(0); }
    else setSlashOpen(false);
  }

  function change(v: string) {
    onChange(v);
    const ta = ref.current;
    if (ta) { autoGrow(ta); detectSlash(ta); }
  }

  // Wrap the current selection with markdown markers (bold, italic, code…).
  function surround(before: string, after = before) {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = value.slice(s, e);
    onChange(value.slice(0, s) + before + sel + after + value.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s + before.length;
      ta.selectionEnd = s + before.length + sel.length;
      autoGrow(ta);
    });
  }

  // Prefix each selected line (lists, quotes).
  function linePrefix(prefix: string) {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const block = value.slice(lineStart, e);
    const prefixed = block.split("\n").map((l) => prefix + l).join("\n");
    onChange(value.slice(0, lineStart) + prefixed + value.slice(e));
    requestAnimationFrame(() => { ta.focus(); autoGrow(ta); });
  }

  function codeBlock() {
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = value.slice(s, e) || "code";
    const pad = s > 0 && value[s - 1] !== "\n" ? "\n" : "";
    onChange(value.slice(0, s) + pad + "```\n" + sel + "\n```\n" + value.slice(e));
    requestAnimationFrame(() => { ta.focus(); autoGrow(ta); });
  }

  function applyTemplate(t: Template) {
    const ta = ref.current;
    const caret = ta ? ta.selectionStart : value.length;
    const before = value.slice(0, caret);
    const m = before.match(/(?:^|\s)(\/[^\s/]*)$/);
    let next: string, pos: number;
    if (m) {
      const start = caret - m[1].length;
      next = value.slice(0, start) + t.content + value.slice(caret);
      pos = start + t.content.length;
    } else {
      next = value + t.content;
      pos = next.length;
    }
    onChange(next);
    setSlashOpen(false);
    requestAnimationFrame(() => {
      if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = pos; autoGrow(ta); }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashOpen && slashMatches.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashSel((i) => Math.min(i + 1, slashMatches.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashSel((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyTemplate(slashMatches[slashSel]); return; }
      if (e.key === "Escape") { setSlashOpen(false); return; }
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); surround("**"); return; }
    if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); surround("_"); return; }
    if (mod && e.key.toLowerCase() === "e") { e.preventDefault(); surround("`"); return; }
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); surround("[", "](url)"); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!canAttach) return;
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); addFiles(files); }
  }

  const tools = [
    { key: "b", title: "Bold  ⌘B", icon: <BoldIcon size={16} />, run: () => surround("**") },
    { key: "i", title: "Italic  ⌘I", icon: <ItalicIcon size={16} />, run: () => surround("_") },
    { key: "c", title: "Inline code  ⌘E", icon: <CodeIcon size={16} />, run: () => surround("`") },
    { key: "cb", title: "Code block", icon: <CodeBlockIcon size={16} />, run: codeBlock },
    { key: "l", title: "Link  ⌘K", icon: <LinkIcon size={16} />, run: () => surround("[", "](url)") },
    { key: "ul", title: "List", icon: <ListIcon size={16} />, run: () => linePrefix("- ") },
    { key: "q", title: "Quote", icon: <QuoteIcon size={16} />, run: () => linePrefix("> ") },
  ];

  const otherModels = models.filter((m) => m !== currentModel);

  return (
    <div className="relative">
      {slashOpen && slashMatches.length > 0 && (
        <div className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg scrollbar-thin">
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Templates</div>
          {slashMatches.map((t, i) => (
            <div
              key={t.id}
              className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm", i === slashSel ? "bg-secondary" : "hover:bg-secondary/60")}
              onMouseEnter={() => setSlashSel(i)}
              onMouseDown={(e) => { e.preventDefault(); applyTemplate(t); }}
            >
              <span className="font-mono text-xs text-brand">/{t.trigger}</span>
              <span className="truncate text-muted-foreground">{t.title}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border bg-card shadow-sm transition-all duration-200 hover:shadow-md focus-within:border-brand/50 focus-within:shadow-md focus-within:ring-2 focus-within:ring-brand/20">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
          <div className="flex items-center gap-0.5">
            {tools.map((t) => (
              <button
                key={t.key}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title={t.title}
                onClick={t.run}
                type="button"
              >
                {t.icon}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {!compact && (
              <>
                <Popover open={presetOpen} onOpenChange={setPresetOpen}>
                  <PopoverTrigger asChild>
                    <button className={chip(!!activePreset)} title="Presets (system prompt)" type="button">
                      {activePreset
                        ? <img src={personaAvatarUrl(activePreset.name)} alt="" className="h-4 w-4 rounded-full bg-muted" />
                        : <WandIcon size={14} />}
                      <span className="max-w-[8rem] truncate">{activePreset ? activePreset.name : "Preset"}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="top" className="w-56 p-1.5">
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Apply a preset</div>
                    <button className={optionCls(!activePreset)} onClick={() => { onApplyPreset?.(null); setPresetOpen(false); }}>Default assistant</button>
                    {presets.map((p) => (
                      <button key={p.id} className={cn(optionCls(activePreset?.id === p.id), "gap-2")} onClick={() => { onApplyPreset?.(p); setPresetOpen(false); }}>
                        <img src={personaAvatarUrl(p.name)} alt="" className="h-5 w-5 shrink-0 rounded-full bg-muted" loading="lazy" />
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                    {presets.length === 0 && <div className="px-2.5 py-2 text-xs text-muted-foreground">No presets yet</div>}
                    <button className="mt-1 w-full border-t px-2.5 py-1.5 text-left text-xs text-brand hover:underline" onClick={() => { setPresetOpen(false); onManageLibrary?.(); }}>Manage library…</button>
                  </PopoverContent>
                </Popover>

                <Popover open={compareOpen} onOpenChange={setCompareOpen}>
                  <PopoverTrigger asChild>
                    <button className={chip(!!compareModel)} title="Compare with a second model inline" type="button">
                      <ColumnsIcon size={14} /> {compareModel ? `vs ${shortModel(compareModel)}` : "Compare"}
                      {compareModel && (
                        <span className="ml-0.5 rounded hover:text-foreground" onClick={(e) => { e.stopPropagation(); onCompareModel?.(null); }}>
                          <XIcon size={12} />
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="top" className="w-56 p-1.5">
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Compare each reply against</div>
                    <button className={optionCls(!compareModel)} onClick={() => { onCompareModel?.(null); setCompareOpen(false); }}>Off</button>
                    {otherModels.map((m) => (
                      <button key={m} className={optionCls(compareModel === m)} onClick={() => { onCompareModel?.(m); setCompareOpen(false); }}>{shortModel(m)}</button>
                    ))}
                    {otherModels.length === 0 && <div className="px-2.5 py-2 text-xs text-muted-foreground">No other models</div>}
                  </PopoverContent>
                </Popover>
              </>
            )}
            <button
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                preview ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
              title="Preview markdown"
              onClick={() => setPreview((p) => !p)}
              type="button"
            >
              <EyeIcon size={16} />
            </button>
          </div>
        </div>

        {/* Attached images */}
        {canAttach && !!images?.length && (
          <div className="flex flex-wrap gap-2 border-b px-3 py-2">
            {images.map((src, i) => (
              <div key={i} className="group relative">
                <img src={src} alt="" className="h-16 w-16 rounded-lg border object-cover" />
                <button
                  type="button"
                  title="Remove"
                  onClick={() => onImages?.(images.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 rounded-full border bg-card p-0.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <XIcon size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Body */}
        <div
          className="flex items-end gap-2 p-2"
          onDragOver={(e) => { if (canAttach) e.preventDefault(); }}
          onDrop={(e) => { if (canAttach && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } }}
        >
          {preview ? (
            <MarkdownView className="prose-chat min-h-[44px] flex-1 px-2 py-1.5" content={value || "_Nothing to preview_"} />
          ) : (
            <textarea
              ref={ref}
              className="max-h-[220px] min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none placeholder:text-muted-foreground scrollbar-thin"
              placeholder={placeholder ?? "Message… ⌘B bold · ⌘E code · / for templates"}
              value={value}
              onChange={(e) => change(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              rows={1}
            />
          )}
            {!compact && dictationAvailable() && (
              <Button size="icon" variant={listening ? "destructive" : "ghost"} type="button"
                title={listening ? "Stop dictation" : "Dictate (speech to text)"}
                className={cn("h-9 w-9 shrink-0", !listening && "text-muted-foreground hover:text-foreground")}
                onClick={toggleMic}>
                <MicIcon size={17} />
              </Button>
            )}
            {canAttach && (
              <>
                <input ref={imgRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
                <Button size="icon" variant="ghost" type="button" title="Attach image (or paste / drop)"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                  disabled={(images?.length || 0) >= 4}
                  onClick={() => imgRef.current?.click()}>
                  <PaperclipIcon size={17} />
                </Button>
              </>
            )}
          {compact ? null : busy ? (
            <Button size="icon" variant="destructive" className="h-9 w-9 shrink-0 rounded-xl" onClick={onStop} title="Stop generating" type="button">
              <StopIcon size={16} />
            </Button>
          ) : (
            <Button size="icon" variant="brand" className="h-9 w-9 shrink-0 rounded-xl" onClick={onSend} disabled={!value.trim()} title="Send" type="button">
              <ArrowUpIcon size={18} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Shrink to <=1024px on the long edge and re-encode as JPEG (data URL). */
function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const MAX = 1024;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("no 2d context"));
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.src = URL.createObjectURL(file);
  });
}
