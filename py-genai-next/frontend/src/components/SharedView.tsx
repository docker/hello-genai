import { useEffect, useState } from "react";
import { api } from "../api";
import { MarkdownView } from "./MarkdownView";
import { BotIcon, UserIcon } from "./icons";

export function SharedView({ token }: { token: string }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState(false);

  useEffect(() => { api.sharedView(token).then(setData).catch(() => setErr(true)); }, [token]);

  if (err)
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">This shared link is not available.</div>;
  if (!data)
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-full bg-muted">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/15 text-brand">
            <BotIcon size={18} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{data.title}</h1>
            <span className="text-xs text-muted-foreground">Shared read-only conversation</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {data.messages.map((m: any, i: number) => {
          const isUser = m.role === "user";
          return (
            <div key={i} className={"flex gap-3 " + (isUser ? "flex-row-reverse" : "")}>
              <span
                className={
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " +
                  (isUser ? "bg-secondary text-secondary-foreground" : "bg-brand/15 text-brand")
                }
              >
                {isUser ? <UserIcon size={16} /> : <BotIcon size={16} />}
              </span>
              {isUser ? (
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand px-4 py-2.5 text-sm text-brand-foreground">
                  {m.content}
                </div>
              ) : (
                <MarkdownView
                  className="prose-chat max-w-[80%] rounded-2xl rounded-tl-sm border bg-card px-4 py-2.5 shadow-sm"
                  content={m.content}
                  enhance
                />
              )}
            </div>
          );
        })}
      </main>

      <footer className="pb-8 text-center text-xs text-muted-foreground">Powered by Hello-GenAI</footer>
    </div>
  );
}
