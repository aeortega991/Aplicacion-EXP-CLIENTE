import { useEffect, useState, useCallback } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, RefreshCw, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { estadoBadge, accionRequerida } from "./estados";
import ExpenseDetailDialog from "./ExpenseDetailDialog";

const fmtDate = (v) => { if (!v) return "—"; try { return new Date(v).toLocaleDateString("es-EC"); } catch { return String(v); } };

export default function GastosAlertas() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/expenses/alerts")
      .then((r) => setItems(r.data.items || []))
      .catch((e) => toast.error(formatApiError(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = (id) => { setDetailId(id); setDetailOpen(true); };

  return (
    <div className="p-8" data-testid="gastos-alertas">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Gastos</div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="w-7 h-7 text-red-600" /> Alertas de autorización
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {loading ? "Cargando…" : items.length === 0 ? "Sin pendientes para ti" : `${items.length} solicitud${items.length === 1 ? "" : "es"} esperan tu autorización`}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={load} data-testid="alertas-refresh">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </Button>
      </div>

      {!loading && items.length === 0 ? (
        <Card className="p-16 text-center border border-dashed border-neutral-300 shadow-none" data-testid="alertas-empty">
          <BellOff className="w-12 h-12 mx-auto text-neutral-300 mb-3" />
          <p className="text-neutral-500">No tienes solicitudes pendientes de tu autorización en este momento.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((r) => {
            const b = estadoBadge(r.estado);
            return (
              <Card
                key={r.id}
                onClick={() => openDetail(r.id)}
                className="p-4 border border-neutral-200 shadow-none hover:border-red-300 hover:shadow-sm transition-all cursor-pointer flex items-center gap-4"
                data-testid={`alerta-row-${r.numero}`}
              >
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold">{r.numero}</span>
                    <Badge variant="outline" className={b.cls}>{b.label}</Badge>
                    <span className="text-xs text-neutral-400">· {r.ciudad}</span>
                  </div>
                  <div className="text-sm text-neutral-700 mt-1 truncate">
                    <span className="font-medium text-red-700">{accionRequerida(r.estado)}</span>
                    {" — "}{r.proveedor} · {r.cuenta_nombre}
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">Solicita: {r.solicitante_nombre} · {fmtDate(r.created_at)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-semibold">{money(r.monto)}</div>
                  <div className="text-xs text-red-600 flex items-center justify-end gap-0.5 mt-1">Revisar <ChevronRight className="w-3 h-3" /></div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ExpenseDetailDialog expenseId={detailId} open={detailOpen} onOpenChange={setDetailOpen} onChanged={load} />
    </div>
  );
}
