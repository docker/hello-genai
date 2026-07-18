import { useEffect, useRef, useState } from "react";
import {
  ALL_STYLES, AvatarOpts, BACKGROUNDS, FLIPS, Flip, SEEDS, STYLE_GROUPS,
  avatarUrl, avatarValue, parseAvatar, randomSeed,
} from "../avatars";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Slider } from "./ui/slider";
import { CheckIcon, WandIcon } from "./icons";

/* ══════════════════════════════════════════════════════════════════════════
   DiceBear picker — style, seed, and the full option set the schema allows.
   ══════════════════════════════════════════════════════════════════════════ */
export function DiceBearPicker({ value, onPick }: { value: string | null; onPick: (v: string) => void }) {
  const parsed = parseAvatar(value);
  const init = parsed.kind === "dicebear" ? parsed : null;
  const [style, setStyle] = useState<string>(init?.style ?? "glyphs");
  const [seed, setSeed] = useState<string>(init?.seed ?? "1");
  const [opts, setOpts] = useState<AvatarOpts>(init?.opts ?? {});

  // Any change re-commits the whole value so the parent always has the latest.
  const commit = (s = style, sd = seed, o = opts) => onPick(avatarValue(s, sd, o));
  const set = (patch: Partial<AvatarOpts>) => { const o = { ...opts, ...patch }; setOpts(o); commit(style, seed, o); };

  function surprise() {
    const s = ALL_STYLES[Math.floor(Math.random() * ALL_STYLES.length)].id;
    const sd = randomSeed();
    const o: AvatarOpts = { bg: BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)] };
    setStyle(s); setSeed(sd); setOpts(o); commit(s, sd, o);
  }

  return (
    <div className="mt-3 space-y-4">
      {/* Live preview + style + randomise */}
      <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-4">
        <img
          src={avatarUrl(style, seed, opts)}
          alt="Avatar preview"
          className="h-20 w-20 shrink-0 rounded-full bg-background ring-1 ring-inset ring-black/5"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <Select value={style} onChange={(e) => { setStyle(e.target.value); commit(e.target.value); }}>
            {STYLE_GROUPS.map((g) => (
              <optgroup key={g.name} label={g.name}>
                {g.styles.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </optgroup>
            ))}
          </Select>
          <div className="flex gap-2">
            <Input
              className="h-8 flex-1 text-xs"
              value={seed}
              maxLength={64}
              placeholder="Seed (any word)"
              onChange={(e) => {
                const v = e.target.value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64);
                setSeed(v); if (v) commit(style, v);
              }}
            />
            <Button variant="secondary" size="sm" className="shrink-0" onClick={surprise} title="Random style, seed and colour">
              <WandIcon size={14} /> Surprise me
            </Button>
          </div>
        </div>
      </div>

      {/* Seed variants for the chosen style */}
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
        {SEEDS.map((sd) => (
          <button
            key={sd}
            onClick={() => { setSeed(sd); commit(style, sd); }}
            aria-pressed={seed === sd}
            title={`${style} · ${sd}`}
            className={cn(
              "aspect-square overflow-hidden rounded-lg bg-muted ring-offset-2 ring-offset-background transition-all hover:scale-105",
              seed === sd && "ring-2 ring-brand"
            )}
          >
            <img src={avatarUrl(style, sd, opts)} alt="" className="h-full w-full" loading="lazy" />
          </button>
        ))}
      </div>

      {/* Customisation */}
      <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
        <div className="text-sm font-medium">Customise</div>

        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Background</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => set({ bg: undefined })}
              title="Style default"
              className={cn("h-7 rounded-md border px-2 text-xs", !opts.bg ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground hover:bg-secondary")}
            >
              Default
            </button>
            {BACKGROUNDS.map((c) => (
              <button
                key={c}
                onClick={() => set({ bg: c })}
                title={`#${c}`}
                style={{ background: `#${c}` }}
                className={cn("h-7 w-7 rounded-md ring-1 ring-inset ring-black/10 transition-transform hover:scale-110",
                  opts.bg === c && "ring-2 ring-brand ring-offset-2 ring-offset-background")}
              />
            ))}
          </div>
        </div>

        <NumRow label="Corner radius" hint={opts.radius === 50 ? "circle" : `${opts.radius ?? 0}`}
          value={opts.radius ?? 0} min={0} max={50} step={1} onChange={(v) => set({ radius: v })} />
        <NumRow label="Zoom" hint={`${(opts.scale ?? 1).toFixed(2)}×`}
          value={opts.scale ?? 1} min={0.5} max={2} step={0.05} onChange={(v) => set({ scale: v })} />
        <NumRow label="Rotate" hint={`${opts.rotate ?? 0}°`}
          value={opts.rotate ?? 0} min={0} max={360} step={5} onChange={(v) => set({ rotate: v })} />

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Flip</span>
          <div className="flex gap-1">
            {FLIPS.map((f) => (
              <button
                key={f}
                onClick={() => set({ flip: f })}
                className={cn("rounded-md border px-2 py-1 text-xs capitalize",
                  (opts.flip ?? "none") === f ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground hover:bg-secondary")}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button className="text-xs text-brand hover:underline" onClick={() => { setOpts({}); commit(style, seed, {}); }}>
            Reset customisation
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Rendered locally with DiceBear — no external requests.</p>
    </div>
  );
}

function NumRow({ label, hint, value, min, max, step, onChange }: {
  label: string; hint: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Slider className="flex-1" value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{hint}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Image editor — pan / zoom / rotate / flip, exported as a square avatar.
   Preview and export share one draw() so what you see is exactly what is saved.
   ══════════════════════════════════════════════════════════════════════════ */
const PREVIEW = 288;
const EXPORT = 256;

export function ImageEditor({ src, onCancel, onApply }: {
  src: string; onCancel: () => void; onApply: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [off, setOff] = useState({ x: 0, y: 0 });   // fraction of the frame

  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; setReady(true); };
    img.src = src;
  }, [src]);

  /** Single source of truth for framing — used by preview *and* export. */
  function draw(ctx: CanvasRenderingContext2D, size: number) {
    const img = imgRef.current;
    if (!img) return;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2 + off.x * size, size / 2 + off.y * size);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, 1);
    const cover = Math.max(size / img.width, size / img.height) * zoom;
    const w = img.width * cover, h = img.height * cover;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !ready) return;
    const ctx = c.getContext("2d");
    if (ctx) draw(ctx, PREVIEW);
  }, [ready, zoom, rot, flipH, off]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = dragRef.current;
    if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    setOff({ x: d.ox + (e.clientX - d.x) / r.width, y: d.oy + (e.clientY - d.y) / r.height });
  }
  const endDrag = () => { dragRef.current = null; };

  function apply() {
    const c = document.createElement("canvas");
    c.width = c.height = EXPORT;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";                 // JPEG has no alpha
    ctx.fillRect(0, 0, EXPORT, EXPORT);
    draw(ctx, EXPORT);
    onApply(c.toDataURL("image/jpeg", 0.88));
  }

  const reset = () => { setZoom(1); setRot(0); setFlipH(false); setOff({ x: 0, y: 0 }); };

  return (
    <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Adjust your photo</span>
        <button className="text-xs text-brand hover:underline" onClick={reset}>Reset</button>
      </div>

      {/* Drag inside the circle to reposition */}
      <div className="flex justify-center">
        <div className="relative" style={{ width: PREVIEW, height: PREVIEW }}>
          <canvas
            ref={canvasRef}
            width={PREVIEW}
            height={PREVIEW}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={(e) => setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.0015)))}
            className="touch-none rounded-full bg-background ring-1 ring-inset ring-black/10"
            style={{ cursor: dragRef.current ? "grabbing" : "grab" }}
          />
          {/* Framing guide */}
          <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-brand/40" />
        </div>
      </div>

      <div className="space-y-2.5">
        <NumRow label="Zoom" hint={`${zoom.toFixed(2)}×`} value={zoom} min={1} max={4} step={0.02} onChange={setZoom} />
        <NumRow label="Rotate" hint={`${rot}°`} value={rot} min={-180} max={180} step={1} onChange={setRot} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRot((r) => ((r - 90 + 540) % 360) - 180)}>Rotate −90°</Button>
          <Button variant="outline" size="sm" onClick={() => setRot((r) => ((r + 90 + 540) % 360) - 180)}>Rotate +90°</Button>
          <Button variant={flipH ? "secondary" : "outline"} size="sm" onClick={() => setFlipH((f) => !f)}>Flip</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Drag to reposition · scroll or use the slider to zoom.</p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="brand" size="sm" disabled={!ready} onClick={apply}>
          <CheckIcon size={15} /> Use photo
        </Button>
      </div>
    </div>
  );
}
