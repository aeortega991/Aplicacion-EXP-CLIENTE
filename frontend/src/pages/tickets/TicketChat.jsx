import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Lock } from "lucide-react";
import { fmtDT } from "./estados";

export const TicketChat = ({ ticket, onSent }) => {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const box = useRef(null);
  const closed = ticket.estado === "Cerrado";

  const load = useCallback(() => {
    api.get(`/ts/tickets/${ticket.id}/mensajes`).then((r) => setMsgs(r.data)).catch(() => {});
  }, [ticket.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post(`/ts/tickets/${ticket.id}/mensajes`, { texto: text });
      setText("");
      load();
      onSent?.();
    } catch (e) { toast.error(formatApiError(e)); } finally { setSending(false); }
  };

  return (
    <section className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-col" data-testid="ts-chat">
      <h2 className="text-base font-semibold mb-3">Chat de seguimiento</h2>
      <div ref={box} className="flex-1 min-h-[200px] max-h-[420px] overflow-y-auto space-y-3 pr-1" data-testid="ts-chat-messages">
        {msgs.length === 0 && <div className="text-xs text-neutral-400 text-center py-8">Aún no hay mensajes.</div>}
        {msgs.map((m) => {
          const analyst = m.role === "analista_tecnico";
          return (
            <div key={m.id} className={`flex ${analyst ? "justify-end" : "justify-start"}`} data-testid="ts-chat-message">
              <div className={`max-w-[85%] rounded-lg px-3 py-2 ${analyst ? "bg-[#0033A0] text-white" : "bg-neutral-100 text-neutral-900"}`}>
                <div className={`text-[11px] font-semibold ${analyst ? "text-white/80" : "text-neutral-500"}`}>
                  {m.user_name} · {analyst ? "Analista" : "Técnico"}
                </div>
                <div className="text-sm whitespace-pre-wrap break-words">{m.texto}</div>
                <div className={`text-[10px] mt-1 ${analyst ? "text-white/60" : "text-neutral-400"}`}>{fmtDT(m.created_at)}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-neutral-100">
        {closed ? (
          <div className="text-xs text-neutral-500 flex items-center gap-1.5" data-testid="ts-chat-closed"><Lock className="w-3.5 h-3.5" /> Ticket cerrado: no se permiten nuevos mensajes.</div>
        ) : ticket.perms?.can_chat ? (
          <div className="flex gap-2 items-end">
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe un mensaje…" className="resize-none" data-testid="ts-chat-input" />
            <Button onClick={send} disabled={sending || !text.trim()} className="bg-[#0033A0] hover:bg-[#002a85]" data-testid="ts-chat-send"><Send className="w-4 h-4" /></Button>
          </div>
        ) : (
          <div className="text-xs text-neutral-500" data-testid="ts-chat-readonly">Solo lectura: participan el técnico solicitante y el analista asignado.</div>
        )}
      </div>
    </section>
  );
};
