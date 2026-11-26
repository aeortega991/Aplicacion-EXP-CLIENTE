import { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { StatusBadge, fmtDT } from "./estados";

const PAGE = 10;
const COLS = ["Ticket", "Creación", "Solicitante", "Ciudad", "Región", "Responsable", "Modelo", "Serie", "Estado", "Últ. actualización", "Acción"];

export default function TicketsList() {
  const { data, loading } = useOutletContext();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(data.items.length / PAGE));
  useEffect(() => { setPage(1); }, [data.items]);
  const rows = data.items.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="bg-white border border-neutral-200 rounded-lg" data-testid="ts-list">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-[11px] uppercase tracking-wider text-neutral-500">
            <tr>{COLS.map((c) => <th key={c} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={COLS.length} className="px-3 py-10 text-center text-neutral-400">{loading ? "Cargando…" : "No hay tickets"}</td></tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-neutral-100 hover:bg-neutral-50" data-testid={`ts-row-${t.numero}`}>
                <td className="px-3 py-2 font-semibold text-[#0033A0] whitespace-nowrap">{t.numero}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDT(t.created_at)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{t.tecnico_nombre}</td>
                <td className="px-3 py-2">{t.ciudad || "—"}</td>
                <td className="px-3 py-2">{t.region_nombre || "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{t.analista_nombre || <span className="text-amber-600">Sin asignar</span>}</td>
                <td className="px-3 py-2">{t.modelo}</td>
                <td className="px-3 py-2">{t.serie}</td>
                <td className="px-3 py-2"><StatusBadge estado={t.estado} /></td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDT(t.updated_at)}</td>
                <td className="px-3 py-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/tickets/t/${t.id}`)} data-testid={`ts-view-${t.numero}`}>
                    <Eye className="w-3.5 h-3.5" /> Ver ticket
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-t border-neutral-100 text-xs text-neutral-500">
        <span data-testid="ts-list-count">{data.items.length} ticket(s)</span>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="ts-page-prev"><ChevronLeft className="w-4 h-4" /></Button>
          <span data-testid="ts-page-info">{page} / {pages}</span>
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={page >= pages} onClick={() => setPage(page + 1)} data-testid="ts-page-next"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}
