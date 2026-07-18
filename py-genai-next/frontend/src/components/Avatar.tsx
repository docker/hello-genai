import { parseAvatar } from "../avatars";

// Deterministic tint for the initials fallback (no avatar chosen yet).
function initialsTint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 62% 45%)`;
}

const base = "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white shadow-sm";

export function Avatar({ avatar, name, size = 32 }: { avatar?: string | null; name?: string; size?: number }) {
  const a = parseAvatar(avatar);
  const dims = { width: size, height: size } as const;

  if (a.kind === "image") {
    return <img className="shrink-0 rounded-full object-cover" style={dims} src={a.src} alt="" />;
  }
  if (a.kind === "dicebear") {
    // The SVG carries its own background; the ring keeps it crisp on any surface.
    return (
      <img
        className="shrink-0 rounded-full bg-muted object-cover ring-1 ring-inset ring-black/5"
        style={dims}
        src={a.src}
        alt=""
        loading="lazy"
      />
    );
  }
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={base} style={{ ...dims, fontSize: Math.round(size * 0.46), background: initialsTint(name || "?") }}>
      {initial}
    </span>
  );
}
