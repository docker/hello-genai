import { useEffect, useState } from "react";
import { api, setToken, token } from "./api";
import { hydratePrefs, initPrefs, registerPrefsSync } from "./lib/prefs";
import { Login } from "./components/Login";
import { Workspace } from "./components/Workspace";
import { SharedView } from "./components/SharedView";
import { BotIcon } from "./components/icons";

initPrefs();
// Appearance changes persist to the account (debounced inside setPrefs).
registerPrefsSync((p) => api.updateProfile({ ui_prefs: p }));

function sharedToken(): string | null {
  const m = location.hash.match(/^#\/shared\/(.+)$/);
  return m ? m[1] : null;
}

function Boot({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <span className="flex h-11 w-11 animate-pulse items-center justify-center rounded-xl bg-brand/15 text-brand">
          <BotIcon size={22} />
        </span>
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [shared, setShared] = useState<string | null>(sharedToken());

  useEffect(() => {
    const onHash = () => setShared(sharedToken());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    (async () => {
      if (token()) {
        try {
          const me = await api.me();
          hydratePrefs(me.ui_prefs);   // the account's appearance wins over this device's cache
          setUser(me);
        } catch {
          setToken(null);
        }
      }
      setReady(true);
    })();
  }, []);

  // Signing in on a new device should adopt that account's appearance too.
  function onAuthed(u: any) {
    hydratePrefs(u?.ui_prefs);
    setUser(u);
  }

  if (shared) return <SharedView token={shared} />;
  if (!ready) return <Boot label="Loading…" />;
  if (!user) return <Login onAuthed={onAuthed} />;
  return <Workspace user={user} onLogout={() => { setToken(null); setUser(null); }} />;
}
