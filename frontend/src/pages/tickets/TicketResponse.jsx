import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExternalLink, Plus, X } from "lucide-react";
import { fmtDT } from "./estados";

const isUrl = (s) => { try { const u = new URL(s); return ["http:", "https:"].includes(u.protocol); } catch { return false; } };

export const TicketResponse = ({ ticket, onSaved }) => {
  const editable = ticket.perms?.can_respond;
  const [text, setText] = useState(ticket.respuesta || "");
  const [links, setLinks] = useState((ticket.respuesta_links || []).map((l) => l.url));
  const [newLink, setNewLink] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setText(ticket.respuesta || ""); setLinks((ticket.respuesta_links || []).map((l) => l.url)); }, [ticket.respuesta, ticket.respuesta_links]);

  const addLink = () => {
    const v = newLink.trim();
    if (!isUrl(v)) { toast.error("Ingrese una URL válida que empiece con http:// o https://"); return; }
    if (!links.includes(v)) setLinks([...links, v]);
    setNewLink("");
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/ts/tickets/${ticket.id}/respuesta`, { respuesta: text, links });
      toast.success("Respuesta técnica guardada");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); }
  };

  return (
    <section className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3" data-testid="ts-response">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Respuesta técnica</h2>
        {ticket.respuesta_updated_at && <span className="text-[11px] text-neutral-400">Actualizada {fmtDT(ticket.respuesta_updated_at)}</span>}
      </div>
      {editable ? (
        <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Instrucciones, recomendaciones, diagnóstico o solución…" data-testid="ts-response-text" />
      ) : (
        <p className="text-sm whitespace-pre-wrap text-neutral-700" data-testid="ts-response-readonly">{ticket.respuesta || "El analista aún no registra una respuesta."}</p>
      )}
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-neutral-500">Multimedia (enlaces)</div>
        {links.length === 0 && <div className="text-xs text-neutral-400">Sin enlaces.</div>}
        {links.map((l) => (
          <div key={l} className="flex items-center gap-2 text-sm">
            <a href={l} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-[#0033A0] hover:underline inline-flex items-center gap-1" data-testid="ts-response-link">
              <ExternalLink className="w-3.5 h-3.5 shrink-0" /> {l}
            </a>
            {editable && <button onClick={() => setLinks(links.filter((x) => x !== l))} className="text-neutral-400 hover:text-red-600"><X className="w-4 h-4" /></button>}
          </div>
        ))}
        {editable && (
          <div className="flex gap-2">
            <Input value={newLink} onChange={(e) => setNewLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} placeholder="https://…" data-testid="ts-response-link-input" />
            <Button variant="outline" size="icon" onClick={addLink} data-testid="ts-response-link-add"><Plus className="w-4 h-4" /></Button>
          </div>
        )}
      </div>
      {editable && (
        <Button onClick={save} disabled={saving} className="bg-[#0033A0] hover:bg-[#002a85]" data-testid="ts-response-save">
          {saving ? "Guardando…" : "Guardar respuesta"}
        </Button>
      )}
    </section>
  );
};
