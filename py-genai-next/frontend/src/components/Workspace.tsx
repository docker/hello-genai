import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ChatEvent, DOCS_URL, emitActivity, notify, setLive, streamChat } from "../api";
import { getTheme, onPrefs, resolvedMode, setTheme } from "../lib/prefs";
import { PREVIEW_URL, openPreview } from "../lib/openPreview";
import { cn } from "../lib/utils";
import { speak, speechSupported } from "../lib/voice";
import { NotificationCenter, ToastHost } from "./NotificationCenter";
import { MemoryModal } from "./MemoryModal";
import { AdminModal } from "./AdminModal";
import { ScheduledModal } from "./ScheduledModal";
import { ShareModal } from "./ShareModal";
import { KnowledgeModal } from "./KnowledgeModal";
import { AnalyticsModal } from "./AnalyticsModal";
import { ActivityModal } from "./ActivityModal";
import { LibraryModal } from "./LibraryModal";
import { BookmarksModal } from "./BookmarksModal";
import { DataMenu } from "./DataMenu";
import { Composer, Preset, Template } from "./Composer";
import { MarkdownView } from "./MarkdownView";
import { CommandPalette, Command } from "./CommandPalette";
import { ConfirmDialog, DeleteProjectDialog, PromptDialog } from "./Dialog";
import { ProfileModal } from "./ProfileModal";
import { Avatar } from "./Avatar";
import { CompareModal } from "./CompareModal";
import { CompareRow, Side } from "./CompareRow";
import { ModelInfoModal } from "./ModelInfoModal";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { Slider } from "./ui/slider";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Tip } from "./ui/tooltip";
import {
  ActivityIcon, ArchiveIcon, BookIcon, BotIcon, ChartIcon, ChevronLeftIcon, ChevronRightIcon,
  BookmarkIcon, ClockIcon, ColumnsIcon, CommandIcon, MoreIcon, CopyIcon, DownloadIcon, EditIcon, FileIcon, FolderIcon, InfoIcon, LayersIcon,
  SpeakerIcon,
  LibraryIcon, LogOutIcon, MenuIcon, MessageIcon, MoonIcon, PlusIcon, ShareIcon, ShieldIcon, SparklesIcon,
  SunIcon, ThumbsDownIcon, ThumbsUpIcon, TrashIcon, UploadIcon, UserIcon, WrenchIcon,
} from "./icons";

const SIDEBAR_MIN = 220, SIDEBAR_MAX = 460;
const fmtNum = (n: number) => (n || 0).toLocaleString();

type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
type Compare = { primary: Side; secondary: Side };
type Msg = { id?: number; role: string; content: string; images?: string[]; bookmarked?: boolean; model?: string; tools?: any[]; branch_count?: number; usage?: Usage | null; feedback?: string | null; compare?: Compare; parent_id?: number };

// Attach a DB id to the most recent id-less user message (just-sent turn).
function tagLastUser(ms: Msg[], id: number): Msg[] {
  const copy = [...ms];
  for (let i = copy.length - 1; i >= 0; i--) {
    if (copy[i].role === "user" && copy[i].id == null) { copy[i] = { ...copy[i], id }; break; }
  }
  return copy;
}

/** Ghost icon button in the navbar with a tooltip. */
function NavIcon({ tip, onClick, children, className }: { tip: string; onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <Tip label={tip}>
      <Button variant="ghost" size="icon" onClick={onClick} aria-label={tip} className={cn("text-muted-foreground hover:text-foreground", className)}>
        {children}
      </Button>
    </Tip>
  );
}

export function Workspace({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [profile, setProfile] = useState<any>(user);
  const [profileOpen, setProfileOpen] = useState(false);
  const [delProjectTarget, setDelProjectTarget] = useState<{ id: number; name: string } | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProject, setActiveProject] = useState<number | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);   // data URLs sent with the next message
  const [streaming, setStreaming] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState<string>("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState<number | null>(null);      // B6 — null = model default
  const [jsonMode, setJsonMode] = useState(false);                      // B4 — response_format: "json"
  const [tempOpen, setTempOpen] = useState(false);
  const [dark, setDark] = useState(getTheme() === "dark");
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);   // B7
  const [compareOpen, setCompareOpen] = useState(false);
  const [modelInfoOpen, setModelInfoOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [compareModel, setCompareModel] = useState<string | null>(null);
  const [compareStream, setCompareStream] = useState<Compare | null>(null);
  const [toast, setToast] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [confirm, setConfirmState] = useState<{ title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void } | null>(null);
  const [sidebarW, setSidebarW] = useState(() => Number(localStorage.getItem("sidebarW")) || 280);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [windowSize, setWindowSize] = useState(80);   // B1 — messages rendered from the tail
  const boxRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const cancelsRef = useRef<Array<() => void>>([]);

  function flash(msg: string) { setToast(msg); window.clearTimeout((flash as any)._t); (flash as any)._t = window.setTimeout(() => setToast(""), 2600); }
  useEffect(() => { localStorage.setItem("sidebarW", String(sidebarW)); }, [sidebarW]);

  // Drag-to-resize the sidebar.
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX, startW = sidebarW;
    const onMove = (ev: MouseEvent) => setSidebarW(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startW + ev.clientX - startX)));
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.userSelect = ""; };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  async function addMemoryFrom(text: string) {
    const t = text.trim().slice(0, 300);
    if (!t) return;
    try { await api.remember(t); flash("Saving to memory…"); } catch { flash("Couldn't save to memory"); }
  }

  // Reflect appearance changes made elsewhere (Profile → Appearance, OS theme
  // while on "system"). The toggle itself calls setTheme — driving it from an
  // effect here would clobber a "system" preference on every mount.
  useEffect(() => onPrefs((p) => setDark(resolvedMode(p) === "dark")), []);
  useEffect(() => { refreshProjects(); refreshLibrary(); api.models().then((m) => { setModels(m.models); setModel(m.current); }).catch(() => {}); }, []);
  useEffect(() => { refreshSessions(); }, [activeProject]);
  // Scheduled prompts run on the backend (Celery beat) and land as new
  // conversations with no UI signal — poll the list so they appear without a
  // manual refresh. Also refetches when the tab regains focus.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") refreshSessions(); };
    const id = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [activeProject]);
  useEffect(() => { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }); }, [messages, streaming]);
  useEffect(() => { setWindowSize(80); }, [current]);   // reset the window per conversation

  // Watch for memories the worker creates in the background and surface each as
  // a notification/toast. Seeds silently on first load so existing ones stay quiet.
  const knownMem = useRef<Set<number> | null>(null);
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const mems = await api.memories();
        const ids = new Set<number>(mems.map((m: any) => m.id));
        if (knownMem.current === null) { knownMem.current = ids; return; }
        for (const m of mems) {
          if (!knownMem.current.has(m.id)) notify({ title: "New memory saved", body: m.content, kind: "memory" });
        }
        knownMem.current = ids;
      } catch { /* ignore */ }
    };
    check();
    const id = setInterval(check, 8000);
    return () => clearInterval(id);
  }, []);

  // ⌘K / Ctrl-K opens the command palette.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  async function refreshSessions() {
    try { setSessions(await api.sessions(activeProject || undefined)); } catch {}
  }
  async function refreshProjects() {
    try { setProjects(await api.projects()); } catch {}
  }
  async function refreshLibrary() {
    try { setTemplates(await api.templates()); } catch {}
    try { setPresets(await api.presets()); } catch {}
  }

  async function openSession(id: string) {
    setCurrent(id);
    setStreaming(null);
    setPaletteOpen(false);
    setDrawerOpen(false);
    setFollowups([]);
    const s = sessions.find((x) => x.id === id);
    if (s && typeof s.temperature === "number") setTemperature(s.temperature);
    setMaxTokens(s?.max_tokens ?? null);
    setJsonMode(s?.response_format === "json");
    try {
      const msgs = await api.messages(id);
      setMessages(msgs.map((m: any) => ({ id: m.id, role: m.role, content: m.content, model: m.model,
        images: m.images || undefined, bookmarked: m.bookmarked,
        branch_count: m.branch_count, usage: m.token_usage, feedback: m.feedback })));
    } catch { setMessages([]); }
  }

  // Update temperature; persist to the current conversation so it sticks.
  function changeTemperature(v: number) {
    setTemperature(v);
    if (current) api.patchSession(current, { temperature: v }).catch(() => {});
  }

  async function newChat() {
    setCurrent(null);
    setMessages([]);
    setStreaming(null);
    setDrawerOpen(false);
    setFollowups([]);
  }

  async function createProject(name: string) {
    await api.createProject({ name });
    refreshProjects();
  }

  function delProject(id: number, name: string) {
    setDelProjectTarget({ id, name });
  }

  async function confirmDeleteProject(deleteChats: boolean) {
    const id = delProjectTarget!.id;
    await api.deleteProject(id, deleteChats);
    if (activeProject === id) setActiveProject(null);
    if (deleteChats) newChat();
    refreshProjects();
    refreshSessions();
  }

  function clearAllChats() {
    setConfirmState({
      title: "Clear all conversations?", message: "This permanently deletes every conversation. Presets, templates and memory are kept.",
      confirmLabel: "Delete all", danger: true,
      onConfirm: async () => { await api.clearAllSessions(); newChat(); refreshSessions(); flash("All conversations cleared"); },
    });
  }

  // Import a chat or full backup from a JSON file (used by the command palette).
  async function importFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (importFileRef.current) importFileRef.current.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data.sessions)) await api.importBackup(data);
      else if (Array.isArray(data.messages)) await api.importSession(data);
      else return;
      refreshSessions();
      refreshLibrary();
    } catch { /* ignore malformed files */ }
  }

  // `override` is only ever a string (edit & resend). Guard the type: this is
  // also wired straight to onClick, which would otherwise pass a MouseEvent and
  // blow up on .trim() — that regression silently broke the send button.
  function send(override?: unknown) {
    const text = (typeof override === "string" ? override : input).trim();
    if (!text || busy) return;
    setInput("");
    setFollowups([]);
    if (compareModel && compareModel !== model) { sendCompare(text); return; }
    setMessages((m) => [...m, { role: "user", content: text, images }]);
    setImages([]);   // consumed by this turn
    setBusy(true);
    const asst: Msg = { role: "assistant", content: "", model, tools: [] };
    setStreaming({ ...asst });

    let acc = "";
    let liveTokens = 0;
    let lastLiveEmit = 0;
    let frameQueued = false;
    const startedAt = Date.now();
    const tools: any[] = [];
    setLive({ active: true, tokens: 0, model });   // begin a live generation
    const cancel = streamChat(
      { message: text, session_id: current, model, images: images.length ? images : undefined,
        use_tools: true, use_memory: true, use_rag: true,
        temperature,
        max_tokens: maxTokens ?? undefined,
        response_format: jsonMode ? "json" : undefined,
        system_prompt: activePreset?.text || undefined },
      (e: ChatEvent) => {
        if (e.start && e.session_id && !current) setCurrent(e.session_id);
        // Tag the just-sent user message with its DB id so it can be deleted.
        if (e.start && e.user_message_id) setMessages((ms) => tagLastUser(ms, e.user_message_id!));
        if (e.tool) { tools.push(e.tool); setStreaming({ role: "assistant", content: acc, model, tools: [...tools] }); }
        if (e.token) {
          // B2 — accumulate and repaint at most once per animation frame instead
          // of once per token; at high token rates this collapses dozens of
          // renders into one and keeps the main thread free for scrolling.
          acc += e.token; liveTokens++;
          if (!frameQueued) {
            frameQueued = true;
            requestAnimationFrame(() => {
              frameQueued = false;
              setStreaming({ role: "assistant", content: acc, model, tools: [...tools] });
            });
          }
          const now = Date.now();
          if (now - lastLiveEmit > 120) {
            lastLiveEmit = now;
            // B13 — tokens/sec over the life of this generation
            const secs = (now - startedAt) / 1000;
            setLive({ active: true, tokens: liveTokens, model, tps: secs > 0.3 ? liveTokens / secs : 0 });
          }
        }
        if (e.error) { acc += `\n\n_Error: ${e.error}_`; setStreaming({ role: "assistant", content: acc, model, tools }); }
        if (e.done) {
          setMessages((m) => [...m, { id: e.message_id, role: "assistant", content: acc, model: e.model, tools: [...tools], usage: e.usage, parent_id: e.user_message_id }]);
          setStreaming(null);
          setBusy(false);
          cancelsRef.current = [];
          setLive({ active: false, tokens: 0 });   // hand off to exact server numbers
          emitActivity();                       // nudge open live panels to refetch now
          setTimeout(emitActivity, 1500);       // and again after memory extraction fires
          const sid = e.session_id || current;
          if (sid) api.suggestions(sid).then((r) => setFollowups(r.suggestions || [])).catch(() => {});
          if (e.is_first) {
            // Scope the brand-new session to the active project, then refresh.
            if (activeProject && e.session_id) api.assignSessionProject(e.session_id, activeProject).catch(() => {});
            setTimeout(refreshSessions, 2500);
          }
        }
      },
      () => { setBusy(false); setLive({ active: false, tokens: 0 }); },
    );
    cancelsRef.current = [cancel];
  }

  // Stop/abandon the in-flight response, keeping whatever streamed so far.
  function stop() {
    cancelsRef.current.forEach((c) => { try { c(); } catch { /* noop */ } });
    cancelsRef.current = [];
    if (streaming && (streaming.content || "").trim()) {
      setMessages((m) => [...m, { role: "assistant", content: streaming.content + "\n\n_(stopped)_", model, tools: streaming.tools }]);
    }
    setStreaming(null);
    setCompareStream(null);
    setBusy(false);
  }

  // Delete a user turn (input + its reply) from the database, then refresh.
  async function deleteTurn(messageId?: number) {
    if (!current || !messageId) return;
    setMessages((ms) => ms.filter((m) => m.id !== messageId && m.parent_id !== messageId));
    await api.deleteTurn(current, messageId).catch(() => {});
  }

  // Inline compare (py-genai style): stream the primary (saved) and a second
  // model (not saved) side by side into a single compare row.
  function sendCompare(text: string) {
    const primaryModel = model, secModel = compareModel!;
    setMessages((m) => [...m, { role: "user", content: text, images }]);
    setImages([]);   // consumed by this turn
    setBusy(true);
    setCompareStream({ primary: { model: primaryModel, content: "" }, secondary: { model: secModel, content: "" } });

    let pAcc = "", sAcc = "", pUsage: any = null, sUsage: any = null, pDone = false, sDone = false;
    const finish = () => {
      if (!pDone || !sDone) return;
      setMessages((m) => [...m, { role: "assistant", content: "", compare: {
        primary: { model: primaryModel, content: pAcc, usage: pUsage },
        secondary: { model: secModel, content: sAcc, usage: sUsage },
      } }]);
      setCompareStream(null);
      setBusy(false);
    };
    const sys = activePreset?.text || undefined;

    // Primary — saved to history.
    const cancelP = streamChat(
      { message: text, session_id: current, model: primaryModel, use_tools: true, use_memory: true, use_rag: true, system_prompt: sys },
      (e: ChatEvent) => {
        if (e.start && e.session_id && !current) setCurrent(e.session_id);
        if (e.token) { pAcc += e.token; setCompareStream((cs) => cs && { ...cs, primary: { ...cs.primary, content: pAcc } }); }
        if (e.error) { pAcc += `\n\n_Error: ${e.error}_`; pDone = true; finish(); }
        if (e.done) {
          pUsage = e.usage; pDone = true;
          if (e.is_first) { if (activeProject && e.session_id) api.assignSessionProject(e.session_id, activeProject).catch(() => {}); setTimeout(refreshSessions, 2500); }
          finish();
        }
      },
      () => { if (!pDone) { pDone = true; finish(); } },
    );

    // Secondary — ephemeral (save:false), no tools to keep it a clean comparison.
    const cancelS = streamChat(
      { message: text, session_id: current, model: secModel, save: false, use_tools: false, use_memory: true, use_rag: true, system_prompt: sys },
      (e: ChatEvent) => {
        if (e.token) { sAcc += e.token; setCompareStream((cs) => cs && { ...cs, secondary: { ...cs.secondary, content: sAcc } }); }
        if (e.error) { sAcc += `\n\n_Error: ${e.error}_`; sDone = true; finish(); }
        if (e.done) { sUsage = e.usage; sDone = true; finish(); }
      },
      () => { if (!sDone) { sDone = true; finish(); } },
    );
    cancelsRef.current = [cancelP, cancelS];
  }

  async function cycleBranch(messageId: number, direction: "prev" | "next") {
    await api.branch(messageId, direction).catch(() => {});
    if (current) openSession(current);
  }

  // Toggle 👍/👎 feedback on an assistant message (optimistic).
  function setFeedback(id: number, value: "up" | "down") {
    const cur = messages.find((m) => m.id === id)?.feedback ?? null;
    const next = cur === value ? null : value;
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, feedback: next } : m)));
    api.feedback(id, next).catch(() => {});
  }

  const commands: Command[] = [
    { id: "new", icon: <PlusIcon size={18} />, label: "New chat", run: newChat },
    { id: "knowledge", icon: <BookIcon size={18} />, label: "Open knowledge base", run: () => setKnowledgeOpen(true) },
    { id: "memory", icon: <SparklesIcon size={18} />, label: "Open memory", run: () => setMemoryOpen(true) },
    { id: "analytics", icon: <ChartIcon size={18} />, label: "Open usage & analytics", run: () => setAnalyticsOpen(true) },
    { id: "activity", icon: <ActivityIcon size={18} />, label: "Open live activity (memory & model performance)", run: () => setActivityOpen(true) },
    { id: "library", icon: <LibraryIcon size={18} />, label: "Open library (presets & templates)", run: () => setLibraryOpen(true) },
    { id: "compare", icon: <ColumnsIcon size={18} />, label: "Compare models side by side", run: () => setCompareOpen(true) },
    { id: "modelinfo", icon: <InfoIcon size={18} />, label: "View model details", run: () => setModelInfoOpen(true) },
    { id: "scheduled", icon: <ClockIcon size={18} />, label: "Scheduled prompts", run: () => setScheduledOpen(true) },
    ...(current ? [{ id: "share", icon: <ShareIcon size={18} />, label: "Share this conversation", run: () => setShareOpen(true) }] : []),
    ...(profile.is_admin ? [{ id: "admin", icon: <ShieldIcon size={18} />, label: "Admin panel", run: () => setAdminOpen(true) }] : []),
    { id: "backup", icon: <ArchiveIcon size={18} />, label: "Download full backup", run: () => api.downloadBackup().catch(() => {}) },
    { id: "export-json", icon: <DownloadIcon size={18} />, label: "Export this chat (JSON)", run: () => current && api.exportSession(current, "json") },
    { id: "export-md", icon: <DownloadIcon size={18} />, label: "Export this chat (Markdown)", run: () => current && api.exportSession(current, "md") },
    { id: "import", icon: <UploadIcon size={18} />, label: "Import chat or backup…", run: () => importFileRef.current?.click() },
    { id: "clearall", icon: <TrashIcon size={18} />, label: "Clear all conversations", run: clearAllChats },
    { id: "starred", icon: <BookmarkIcon size={18} />, label: "Starred messages", run: () => setBookmarksOpen(true) },
    { id: "theme", icon: dark ? <SunIcon size={18} /> : <MoonIcon size={18} />, label: `Switch to ${dark ? "light" : "dark"} mode`, run: () => setDark(!dark) },
    { id: "project", icon: <FolderIcon size={18} />, label: "New project", run: () => setNewProjectOpen(true) },
    { id: "profile", icon: <UserIcon size={18} />, label: "Edit profile & avatar", run: () => setProfileOpen(true) },
    { id: "docs", icon: <FileIcon size={18} />, label: "Open API docs (Swagger)", run: () => window.open(DOCS_URL, "_blank") },
    { id: "preview", icon: <SparklesIcon size={18} />, label: "Open preview / tour page", run: () => window.open("/preview", "_blank", "noopener") },
    { id: "logout", icon: <LogOutIcon size={18} />, label: "Sign out", run: onLogout },
  ];

  const modelShort = (m: string) => m.split("/").pop();

  // Stable identities for the per-message callbacks. A ref keeps them pointing at
  // the newest closures (no stale state) while the object handed to <Message>
  // never changes — which is what lets React.memo actually skip re-renders.
  // B5 — edit a past message: persist the new text, drop everything after it,
  // and resend so the assistant answers the edited prompt.
  async function editAndResend(id: number, content: string) {
    const next = window.prompt("Edit your message and resend:", content);
    if (next == null || !next.trim() || next === content) return;
    try { await api.editMessage(id, next.trim()); } catch { /* keep going — resend still works */ }
    setMessages((ms) => {
      const i = ms.findIndex((m) => m.id === id);
      return i === -1 ? ms : ms.slice(0, i);
    });
    send(next.trim());   // pass explicitly — setInput hasn't flushed yet
  }

  // B7 — optimistic star toggle; the server owns the truth on reload.
  async function toggleBookmark(id: number) {
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, bookmarked: !m.bookmarked } : m)));
    try { const r = await api.bookmark(id); flash(r?.bookmarked ? "Starred" : "Star removed"); }
    catch { setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, bookmarked: !m.bookmarked } : m))); }
  }

  const cbRef = useRef({ cycleBranch, setFeedback, addMemoryFrom, deleteTurn, flash, editAndResend, toggleBookmark });
  cbRef.current = { cycleBranch, setFeedback, addMemoryFrom, deleteTurn, flash, editAndResend, toggleBookmark };
  const msgHandlers = useMemo(() => ({
    onBranch: (id: number, d: "prev" | "next") => cbRef.current.cycleBranch(id, d),
    onFeedback: (id: number, v: "up" | "down") => cbRef.current.setFeedback(id, v),
    onAddMemory: (t: string) => cbRef.current.addMemoryFrom(t),
    onDelete: (id?: number) => cbRef.current.deleteTurn(id),
    onCopy: (t: string) => { navigator.clipboard?.writeText(t); cbRef.current.flash("Copied"); },
    onEdit: (id: number, content: string) => cbRef.current.editAndResend(id, content),
    onBookmark: (id: number) => cbRef.current.toggleBookmark(id),
  }), []);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu" onClick={() => setDrawerOpen((o) => !o)}>
            <MenuIcon size={18} />
          </Button>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-sm ring-1 ring-inset ring-white/20">
              <BotIcon size={17} />
            </span>
            <span className="hidden text-[15px] font-semibold tracking-heading sm:inline">Hello-GenAI</span>
          </div>
        </div>

        {/* Command palette trigger */}
        <button
          className="group ml-1 hidden h-9 min-w-[13rem] max-w-sm flex-1 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted md:flex"
          onClick={() => setPaletteOpen(true)}
        >
          <CommandIcon size={15} />
          <span className="flex-1 text-left">Search or run a command…</span>
          <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground">⌘K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Model + temperature */}
          <div className="hidden items-center gap-1.5 sm:flex">
            <Select value={model} onChange={(e) => setModel(e.target.value)} className="h-9 w-[9.5rem] text-xs">
              {models.map((m) => <option key={m} value={m}>{modelShort(m)}</option>)}
            </Select>
            <Popover open={tempOpen} onOpenChange={setTempOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 font-mono text-xs">
                  <span className="text-[0.7rem]">🌡</span> {temperature.toFixed(1)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-medium">Temperature</span>
                  <span className="font-mono text-muted-foreground">{temperature.toFixed(2)}</span>
                </div>
                <Slider min={0} max={2} step={0.05} value={[temperature]} onValueChange={([v]) => changeTemperature(v)} />
                <div className="mt-2 flex justify-between text-[0.7rem] text-muted-foreground">
                  <span>Precise</span><span>Balanced</span><span>Creative</span>
                </div>

                {/* B6 — per-session max tokens (persisted on the session) */}
                <Separator className="my-3" />
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">Max tokens</span>
                  <span className="font-mono text-muted-foreground">{maxTokens ?? "auto"}</span>
                </div>
                <Slider min={0} max={8192} step={256}
                  value={[maxTokens ?? 0]}
                  onValueChange={([v]) => { const n = v === 0 ? null : v; setMaxTokens(n); if (current) api.patchSession(current, { max_tokens: n }).catch(() => {}); }} />
                <div className="mt-1 text-[0.7rem] text-muted-foreground">0 = let the model decide</div>

                {/* B4 — structured output */}
                <Separator className="my-3" />
                <label className="flex cursor-pointer items-center justify-between text-sm">
                  <span className="font-medium">JSON mode</span>
                  <Switch checked={jsonMode} onCheckedChange={(v) => { setJsonMode(v); if (current) api.patchSession(current, { response_format: v ? "json" : null }).catch(() => {}); }} />
                </label>
                <div className="mt-1 text-[0.7rem] text-muted-foreground">Force valid JSON responses</div>
              </PopoverContent>
            </Popover>
            <NavIcon tip="Model details" onClick={() => setModelInfoOpen(true)}><InfoIcon size={18} /></NavIcon>
          </div>

          <Separator orientation="vertical" className="mx-0.5 hidden h-6 sm:block" />

          {/* Tool actions */}
          <div className="hidden items-center gap-0.5 xl:flex">
            <NavIcon tip="Compare models" onClick={() => setCompareOpen(true)}><ColumnsIcon size={18} /></NavIcon>
            <NavIcon tip="Library — presets & templates" onClick={() => setLibraryOpen(true)}><LibraryIcon size={18} /></NavIcon>
            <NavIcon tip="Starred messages" onClick={() => setBookmarksOpen(true)}><BookmarkIcon size={18} /></NavIcon>
            <NavIcon tip="Knowledge base" onClick={() => setKnowledgeOpen(true)}><BookIcon size={18} /></NavIcon>
            <NavIcon tip="Usage & analytics" onClick={() => setAnalyticsOpen(true)}><ChartIcon size={18} /></NavIcon>
            <NavIcon tip="Live activity" onClick={() => setActivityOpen(true)}><ActivityIcon size={18} /></NavIcon>
            <NavIcon tip="Scheduled prompts" onClick={() => setScheduledOpen(true)}><ClockIcon size={18} /></NavIcon>
            {profile.is_admin && <NavIcon tip="Admin" onClick={() => setAdminOpen(true)}><ShieldIcon size={18} /></NavIcon>}
          </div>

          {/* Below xl the icon rail doesn't fit, so the same actions live here.
              Labelled rows with 44px targets — icon-only would be unusable on a phone. */}
          <DropdownMenu>
            <Tip label="More tools">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More tools" className="text-muted-foreground hover:text-foreground xl:hidden">
                  <MoreIcon size={18} />
                </Button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end" className="w-60">
              {[
                { label: "Compare models", icon: <ColumnsIcon size={16} />, run: () => setCompareOpen(true) },
                { label: "Library — presets & templates", icon: <LibraryIcon size={16} />, run: () => setLibraryOpen(true) },
                { label: "Starred messages", icon: <BookmarkIcon size={16} />, run: () => setBookmarksOpen(true) },
                { label: "Knowledge base", icon: <BookIcon size={16} />, run: () => setKnowledgeOpen(true) },
                { label: "Usage & analytics", icon: <ChartIcon size={16} />, run: () => setAnalyticsOpen(true) },
                { label: "Live activity", icon: <ActivityIcon size={16} />, run: () => setActivityOpen(true) },
                { label: "Scheduled prompts", icon: <ClockIcon size={16} />, run: () => setScheduledOpen(true) },
                ...(profile.is_admin ? [{ label: "Admin", icon: <ShieldIcon size={16} />, run: () => setAdminOpen(true) }] : []),
              ].map((a) => (
                <DropdownMenuItem key={a.label} onSelect={a.run} className="min-h-11 gap-2.5">
                  {a.icon} {a.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="min-h-11 gap-2.5">
                <a href={DOCS_URL} target="_blank" rel="noopener noreferrer"><FileIcon size={16} /> API docs (Swagger)</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="min-h-11 gap-2.5">
                <a href={PREVIEW_URL} target="_blank" rel="noopener noreferrer" onClick={openPreview}><SparklesIcon size={16} /> Product tour</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <NavIcon tip="Memory" onClick={() => setMemoryOpen(true)}><SparklesIcon size={18} /></NavIcon>
          <DataMenu currentSessionId={current} onRefresh={() => { refreshSessions(); refreshLibrary(); }} onCleared={newChat} />
          <Tip label="API docs (Swagger)">
            <Button asChild variant="ghost" size="icon" className="hidden text-muted-foreground hover:text-foreground xl:inline-flex">
              <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" aria-label="API docs"><FileIcon size={18} /></a>
            </Button>
          </Tip>
          <NotificationCenter />

          <Separator orientation="vertical" className="mx-0.5 h-6" />

          <NavIcon tip={dark ? "Light mode" : "Dark mode"} onClick={() => setTheme(dark ? "light" : "dark")}>{dark ? <SunIcon size={18} /> : <MoonIcon size={18} />}</NavIcon>
          <NavIcon tip="Sign out" onClick={onLogout}><LogOutIcon size={18} /></NavIcon>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1">
        {drawerOpen && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setDrawerOpen(false)} />}

        {/* Sidebar */}
        <aside
          className={cn(
            // Mobile drawer height MUST use dvh, not inset-y-0/h-full: on phones the
            // layout viewport includes the area behind the collapsing URL bar, so a
            // full-height fixed panel puts its footer (profile / product tour) under
            // the browser chrome where it can't be seen or tapped. dvh tracks the
            // visible viewport. overflow-hidden keeps children from spilling out.
            "fixed left-0 top-0 z-40 flex h-[100dvh] w-[280px] flex-col overflow-hidden border-r bg-muted p-3 transition-transform lg:static lg:h-full lg:z-auto lg:translate-x-0",
            drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
          style={{ width: sidebarW }}
        >
          <Button variant="brand" className="w-full shrink-0 justify-start gap-2" onClick={newChat}>
            <PlusIcon size={17} /> New chat
          </Button>

          {/* Projects — capped so a long list can't push the footer off-screen */}
          <div className="mt-4 max-h-[32vh] shrink-0 overflow-y-auto scrollbar-thin">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">Projects</span>
              <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-muted-foreground" title="New project" onClick={() => setNewProjectOpen(true)}>
                <PlusIcon size={15} />
              </Button>
            </div>
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                activeProject === null ? "relative bg-secondary font-medium text-secondary-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
              onClick={() => setActiveProject(null)}
            >
              <LayersIcon size={16} /> All chats
            </button>
            {projects.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  activeProject === p.id ? "relative bg-secondary font-medium text-secondary-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
                onClick={() => setActiveProject(p.id)}
              >
                <FolderIcon size={16} className="shrink-0" />
                <span className="flex-1 truncate">{p.name}</span>
                <button
                  className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  title="Delete project"
                  onClick={(e) => { e.stopPropagation(); delProject(p.id, p.name); }}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
          </div>

          <Separator className="my-3" />

          {/* Sessions */}
          <div className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 scrollbar-thin">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                  s.id === current ? "relative bg-secondary font-medium text-secondary-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
                onClick={() => openSession(s.id)}
              >
                <MessageIcon size={15} className="shrink-0 opacity-70" />
                <span className="flex-1 truncate">{s.title}</span>
                <button
                  className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  title="Delete chat"
                  onClick={(e) => { e.stopPropagation(); api.deleteSession(s.id).then(refreshSessions); if (current === s.id) newChat(); }}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
            {sessions.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No conversations yet</p>}
          </div>

          {/* Footer — shrink-0 so it is always visible above the fold */}
          <div className="mt-2 shrink-0 border-t pt-2">
            <button
              className="flex min-h-11 w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-secondary/60"
              title="Edit profile"
              onClick={() => setProfileOpen(true)}
            >
              <Avatar avatar={profile.avatar} name={profile.display_name || profile.email} size={30} />
              <span className="flex-1 truncate text-sm font-medium">{profile.display_name || profile.email}</span>
            </button>
            {/* min-h-11 = 44px: the iOS/WCAG minimum touch target */}
            <a
              className="mt-1 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              href={PREVIEW_URL} target="_blank" rel="noopener noreferrer" onClick={openPreview} title="Open preview / tour"
            >
              <SparklesIcon size={15} /> Product tour
            </a>
          </div>
        </aside>

        {/* Resize handle */}
        <div className="hidden w-1 cursor-col-resize bg-transparent transition-colors hover:bg-brand/40 lg:block" onMouseDown={startResize} title="Drag to resize" />

        {/* Chat */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin" ref={boxRef}>
            <div className="mx-auto w-full px-4 py-6" style={{ maxWidth: "var(--chat-max)" }}>
              {messages.length === 0 && !streaming && (
                <div className="stagger flex flex-col items-center justify-center py-24 text-center">
                  <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-brand-foreground shadow-lg ring-1 ring-inset ring-white/20">
                    <span className="absolute -inset-3 -z-10 rounded-[2rem] bg-brand/25 blur-2xl" />
                    <BotIcon size={32} />
                  </span>
                  <h2 className="mt-6 text-[1.7rem] font-semibold tracking-heading">How can I help today?</h2>
                  <p className="mt-2.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                    Realtime local AI — FastAPI · Postgres · Redis · Celery. Ask anything, compare models, or ground answers in your knowledge base.
                  </p>
                </div>
              )}
              {messages.length > windowSize && (
                <div className="mb-4 flex justify-center">
                  <Button variant="outline" size="sm" onClick={() => setWindowSize((n) => n + 80)}>
                    Show earlier messages ({messages.length - windowSize} more)
                  </Button>
                </div>
              )}
              <div className="space-y-6">
                {messages.slice(-windowSize).map((m, i) => (
                  m.compare
                    ? <CompareRow key={m.id ?? i} primary={m.compare.primary} secondary={m.compare.secondary} />
                    : <Message key={m.id ?? i} msg={m} userAvatar={profile.avatar} userName={profile.display_name || profile.email} {...msgHandlers} />
                ))}
                {streaming && <Message msg={streaming} streaming />}
                {compareStream && <CompareRow primary={compareStream.primary} secondary={compareStream.secondary} streaming />}
              </div>
            </div>
          </div>

          <div className="mx-auto w-full px-4 pb-4" style={{ maxWidth: "var(--chat-max)" }}>
            {followups.length > 0 && !busy && (
              <div className="mb-3 flex flex-wrap gap-2">
                {followups.map((f, i) => (
                  <button
                    key={i}
                    className="rounded-md border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:border-brand/40 hover:text-foreground"
                    onClick={() => { setInput(f); setFollowups([]); }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
            <Composer
              images={images}
              onImages={setImages}
              value={input}
              onChange={setInput}
              onSend={send}
              onStop={stop}
              busy={busy}
              templates={templates}
              presets={presets}
              activePreset={activePreset}
              onApplyPreset={setActivePreset}
              onManageLibrary={() => setLibraryOpen(true)}
              models={models}
              currentModel={model}
              compareModel={compareModel}
              onCompareModel={setCompareModel}
            />
          </div>
        </main>
      </div>

      <input ref={importFileRef} type="file" accept="application/json,.json" className="hidden" onChange={importFromFile} />
      {memoryOpen && <MemoryModal onClose={() => setMemoryOpen(false)} />}
      {adminOpen && <AdminModal onClose={() => setAdminOpen(false)} />}
      {scheduledOpen && <ScheduledModal models={models} onRan={refreshSessions} onClose={() => setScheduledOpen(false)} />}
      {shareOpen && current && <ShareModal sessionId={current} onClose={() => setShareOpen(false)} />}
      {knowledgeOpen && <KnowledgeModal projectId={activeProject} onClose={() => setKnowledgeOpen(false)} />}
      {analyticsOpen && <AnalyticsModal onClose={() => setAnalyticsOpen(false)} />}
      {activityOpen && <ActivityModal onClose={() => setActivityOpen(false)} />}
      {libraryOpen && <LibraryModal onClose={() => setLibraryOpen(false)} onChanged={refreshLibrary} />}
      {bookmarksOpen && <BookmarksModal onOpenSession={openSession} onClose={() => setBookmarksOpen(false)} />}
      {modelInfoOpen && <ModelInfoModal currentModel={model} onClose={() => setModelInfoOpen(false)} />}
      {compareOpen && (
        <CompareModal models={models} defaultModel={model} sessionId={current}
          initialPrompt={input.trim() || [...messages].reverse().find((m) => m.role === "user")?.content || ""}
          onClose={() => setCompareOpen(false)} />
      )}
      {paletteOpen && <CommandPalette commands={commands} onOpenSession={openSession} onClose={() => setPaletteOpen(false)} />}
      {newProjectOpen && (
        <PromptDialog title="New project" label="Project name" placeholder="e.g. Research"
          onSubmit={createProject} onClose={() => setNewProjectOpen(false)} />
      )}
      {confirm && (
        <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel}
          danger={confirm.danger} onConfirm={confirm.onConfirm} onClose={() => setConfirmState(null)} />
      )}
      {delProjectTarget && (
        <DeleteProjectDialog name={delProjectTarget.name} onConfirm={confirmDeleteProject}
          onClose={() => setDelProjectTarget(null)} />
      )}
      {profileOpen && (
        <ProfileModal user={profile} onSaved={setProfile} onClose={() => setProfileOpen(false)} />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-slide-up rounded-md border bg-card px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
      <ToastHost />
    </div>
  );
}

// Memoised: while a reply streams, Workspace re-renders on every chunk. Without
// this, every message in the thread re-renders per token. Handlers are passed via
// the stable `msgHandlers` object below, so the default shallow compare works and
// only the message whose `msg` object actually changed re-renders.
const Message = memo(function Message({ msg, streaming, userAvatar, userName, onBranch, onFeedback, onAddMemory, onCopy, onDelete, onEdit, onBookmark }: {
  msg: Msg; streaming?: boolean; userAvatar?: string | null; userName?: string;
  onBranch?: (id: number, d: "prev" | "next") => void;
  onFeedback?: (id: number, v: "up" | "down") => void;
  onAddMemory?: (t: string) => void; onCopy?: (t: string) => void; onDelete?: (id?: number) => void;
  onEdit?: (id: number, content: string) => void;
  onBookmark?: (id: number) => void;
}) {
  const isUser = msg.role === "user";
  const branches = msg.branch_count || 0;
  const total = msg.usage?.total_tokens || 0;

  // Prefer the user's current text selection within this message; else the whole message.
  function selectedOrAll(): string {
    const sel = window.getSelection?.()?.toString().trim();
    return sel && sel.length > 1 ? sel : msg.content;
  }

  const actionBtn = "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

  return (
    <div className={cn("msg-row group flex gap-3", isUser && "flex-row-reverse")}>
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          isUser ? "overflow-hidden" : "bg-brand text-brand-foreground shadow-sm"
        )}
      >
        {isUser
          ? ((userAvatar || userName) ? <Avatar avatar={userAvatar} name={userName} size={32} /> : <span className="flex h-full w-full items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><UserIcon size={17} /></span>)
          : <BotIcon size={18} />}
      </span>

      <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-1.5", isUser && "items-end")}>
        {!isUser && msg.tools && msg.tools.length > 0 && (
          <div className="w-full space-y-1.5">
            {msg.tools.map((t, i) => (
              <div key={i} className="rounded-lg border border-l-2 border-l-brand bg-muted/40 px-3 py-2 text-xs">
                <span className="flex items-center gap-1.5 font-mono text-muted-foreground">
                  <WrenchIcon size={13} /> <b className="text-foreground">{t.name}</b>({Object.values(t.arguments || {}).join(", ")})
                </span>
                <div className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{t.result}</div>
              </div>
            ))}
          </div>
        )}

        {isUser ? (
          <div className="flex flex-col items-end gap-1.5">
            {!!msg.images?.length && (
              <div className="flex flex-wrap justify-end gap-1.5">
                {msg.images.map((src, i) => (
                  <img key={i} src={src} alt="" className="max-h-48 rounded-xl border object-cover shadow-sm" />
                ))}
              </div>
            )}
            {msg.content && (
              <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-brand px-4 py-2.5 text-sm text-brand-foreground shadow-sm">
                {msg.content}
              </div>
            )}
          </div>
        ) : (
          <MarkdownView
            className="prose-chat w-full rounded-2xl rounded-tl-sm border bg-card px-4 py-3 shadow-sm"
            content={msg.content || (streaming ? "▍" : "")}
            enhance={!streaming}
            streaming={streaming}
          />
        )}

        <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", isUser && "flex-row-reverse")}>
          {!isUser && msg.model && <Badge variant="muted" className="font-mono text-[0.65rem]">{msg.model.split("/").pop()}</Badge>}
          {!isUser && total > 0 && (
            <span title={`prompt ${fmtNum(msg.usage?.prompt_tokens || 0)} · completion ${fmtNum(msg.usage?.completion_tokens || 0)} · total ${fmtNum(total)} tokens`}>
              {fmtNum(total)} tok
            </span>
          )}
          {!isUser && branches > 1 && msg.id && onBranch && (
            <span className="flex items-center gap-1">
              <button className={actionBtn + " h-6 w-6"} title="Previous version" onClick={() => onBranch(msg.id!, "prev")}><ChevronLeftIcon size={14} /></button>
              <span>{branches} versions</span>
              <button className={actionBtn + " h-6 w-6"} title="Next version" onClick={() => onBranch(msg.id!, "next")}><ChevronRightIcon size={14} /></button>
            </span>
          )}
          {!streaming && (msg.content || "").trim() && (
            <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button className={actionBtn} title="Copy" onClick={() => onCopy?.(msg.content)}><CopyIcon size={14} /></button>
              {!isUser && speechSupported() && (
                <button className={actionBtn} title="Read aloud" onClick={() => speak(msg.content)}><SpeakerIcon size={14} /></button>
              )}
              {isUser && msg.id && onEdit && (
                <button className={actionBtn} title="Edit & resend" onClick={() => onEdit(msg.id!, msg.content)}><EditIcon size={14} /></button>
              )}
              <button className={actionBtn} title="Add selection to memory" onClick={() => onAddMemory?.(selectedOrAll())}><SparklesIcon size={14} /></button>
              {msg.id && onBookmark && (
                <button className={cn(actionBtn, msg.bookmarked && "text-brand")} title={msg.bookmarked ? "Remove star" : "Star this message"} onClick={() => onBookmark(msg.id!)}><BookmarkIcon size={14} /></button>
              )}
              {!isUser && msg.id && onFeedback && (
                <>
                  <button className={cn(actionBtn, msg.feedback === "up" && "text-success")} title="Good response" onClick={() => onFeedback(msg.id!, "up")}><ThumbsUpIcon size={14} /></button>
                  <button className={cn(actionBtn, msg.feedback === "down" && "text-destructive")} title="Bad response" onClick={() => onFeedback(msg.id!, "down")}><ThumbsDownIcon size={14} /></button>
                </>
              )}
              {isUser && msg.id && onDelete && (
                <button className={cn(actionBtn, "hover:text-destructive")} title="Delete this message and its reply" onClick={() => onDelete(msg.id)}><TrashIcon size={14} /></button>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
