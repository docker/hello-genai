import { useEffect, useState } from "react";
import { api } from "../api";
import { Switch } from "./ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

const fmt = (n: number) => (n || 0).toLocaleString();

export function AdminModal({ onClose }: { onClose: () => void }) {
  const [ov, setOv] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);

  const refresh = () => {
    api.adminOverview().then(setOv).catch(() => {});
    api.adminUsers().then(setUsers).catch(() => {});
  };
  useEffect(() => { refresh(); }, []);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Admin</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tile label="Users" value={ov ? fmt(ov.users) : "—"} />
          <Tile label="Active" value={ov ? fmt(ov.active_users) : "—"} />
          <Tile label="Conversations" value={ov ? fmt(ov.sessions) : "—"} />
          <Tile label="Messages" value={ov ? fmt(ov.messages) : "—"} />
          <Tile label="Total tokens" value={ov ? fmt(ov.total_tokens) : "—"} />
        </div>

        <h4 className="mt-2 text-sm font-semibold">Users</h4>
        <div className="max-h-[46vh] overflow-auto rounded-lg border scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-right font-medium">Msgs</th>
                <th className="px-3 py-2 text-center font-medium">Admin</th>
                <th className="px-3 py-2 text-center font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">{u.email}{u.display_name ? ` · ${u.display_name}` : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(u.messages)}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex justify-center">
                      <Switch checked={u.is_admin} onCheckedChange={(v) => api.adminSetAdmin(u.id, v).then(refresh)} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex justify-center">
                      <Switch checked={u.is_active} onCheckedChange={(v) => api.adminSetActive(u.id, v).then(refresh).catch(() => {})} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Tile({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
