import { useEffect, useRef, useState } from "react";
import { Notif, onNotify } from "../api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tip } from "./ui/tooltip";
import { BellIcon, CheckIcon, SparklesIcon, XIcon } from "./icons";

type Item = Notif & { id: number; ts: number; read: boolean };

const TOAST_MS = 6000;
let seq = 1;
const nextId = () => seq++;

const ago = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const kindIconWrap = (kind?: Notif["kind"]) =>
  cn(
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
    kind === "memory" && "border-violet-500/30 bg-violet-500/10 text-violet-500",
    kind === "success" && "border-success/30 bg-success/10 text-success",
    kind === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
    (!kind || kind === "info") && "border-border bg-muted text-muted-foreground"
  );

function KindIcon({ kind }: { kind?: Notif["kind"] }) {
  if (kind === "memory") return <SparklesIcon size={16} />;
  if (kind === "success") return <CheckIcon size={16} />;
  return <BellIcon size={16} />;
}

// Bell + dropdown history panel — lives in the navbar.
export function NotificationCenter() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => onNotify((n) => {
    setItems((xs) => [{ ...n, id: nextId(), ts: Date.now(), read: false }, ...xs].slice(0, 50));
  }), []);

  const unread = items.filter((i) => !i.read).length;

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (o) setItems((xs) => xs.map((i) => ({ ...i, read: true })));
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tip label="Notifications">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative text-muted-foreground hover:text-foreground">
            <BellIcon size={18} />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] font-bold text-destructive-foreground ring-2 ring-background">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          {items.length > 0 && (
            <button className="text-xs text-brand hover:underline" onClick={() => setItems([])}>Clear all</button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5 scrollbar-thin">
          {items.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>}
          {items.map((i) => (
            <div key={i.id} className="group flex items-start gap-3 rounded-lg p-2.5 hover:bg-secondary/60">
              <span className={kindIconWrap(i.kind)}><KindIcon kind={i.kind} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{i.title}</div>
                {i.body && <div className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{i.body}</div>}
                <div className="mt-1 text-[0.68rem] text-muted-foreground/70">{ago(i.ts)}</div>
              </div>
              <button
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                onClick={() => setItems((xs) => xs.filter((x) => x.id !== i.id))}
              >
                <XIcon size={13} />
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Toast stack — mounted at the app root (outside the navbar's stacking context)
// so it renders above modals. Independent onNotify listener from the bell panel.
export function ToastHost() {
  const [toasts, setToasts] = useState<Item[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const off = onNotify((n) => {
      const item: Item = { ...n, id: nextId(), ts: Date.now(), read: false };
      setToasts((xs) => [...xs, item].slice(-4));
      const t = window.setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== item.id)), TOAST_MS);
      timers.current.push(t);
    });
    return () => { off(); timers.current.forEach(clearTimeout); };
  }, []);

  const dismiss = (id: number) => setToasts((xs) => xs.filter((t) => t.id !== id));

  if (toasts.length === 0) return null;
  return (
    // Anchored to a dvh-tall column rather than `bottom-4`: on mobile a fixed
    // element's bottom edge sits behind the collapsing URL bar, which would hide
    // the toasts. justify-end keeps them pinned to the *visible* bottom.
    <div className="pointer-events-none fixed right-4 top-0 z-[80] flex h-[100dvh] w-[min(22rem,calc(100vw-2rem))] flex-col justify-end gap-2.5 pb-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border bg-card p-3.5 shadow-xl animate-toast-in"
        >
          <span className={kindIconWrap(t.kind)}><KindIcon kind={t.kind} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t.title}</div>
            {t.body && <div className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{t.body}</div>}
          </div>
          <button className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => dismiss(t.id)}>
            <XIcon size={14} />
          </button>
          <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-brand to-brand/40 animate-toast-bar" />
        </div>
      ))}
    </div>
  );
}
