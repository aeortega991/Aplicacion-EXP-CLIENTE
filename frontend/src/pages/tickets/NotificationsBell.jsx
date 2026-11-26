import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck } from "lucide-react";
import { fmtDT } from "./estados";

export const NotificationsBell = () => {
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api.get("/ts/notifications").then((r) => setData(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) await api.post(`/ts/notifications/${n.id}/read`).catch(() => {});
    load();
    navigate(`/tickets/t/${n.ticket_id}`);
  };

  const readAll = async () => {
    await api.post("/ts/notifications/read-all").catch(() => {});
    load();
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" data-testid="ts-notifications-btn">
          <Bell className="w-4 h-4" />
          {data.unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center" data-testid="ts-notifications-badge">
              {data.unread > 99 ? "99+" : data.unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,360px)] p-0" data-testid="ts-notifications-panel">
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100">
          <span className="text-sm font-semibold">Notificaciones</span>
          {data.unread > 0 && (
            <button onClick={readAll} className="text-xs text-[#0033A0] hover:underline inline-flex items-center gap-1" data-testid="ts-notifications-read-all">
              <CheckCheck className="w-3.5 h-3.5" /> Marcar todas como leídas
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {data.items.length === 0 && <div className="text-xs text-neutral-400 text-center py-8">Sin notificaciones</div>}
          {data.items.map((n) => (
            <button key={n.id} onClick={() => openItem(n)} data-testid="ts-notification-item"
              className={`w-full text-left px-3 py-2.5 border-b border-neutral-50 hover:bg-neutral-50 flex gap-2 ${n.read ? "" : "bg-blue-50/60"}`}>
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-transparent" : "bg-[#0033A0]"}`} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{n.titulo}</span>
                <span className="block text-xs text-neutral-600 line-clamp-2">{n.mensaje}</span>
                <span className="block text-[10px] text-neutral-400 mt-0.5">{fmtDT(n.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
