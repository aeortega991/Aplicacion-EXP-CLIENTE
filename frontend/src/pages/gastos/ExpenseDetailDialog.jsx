import { useEffect, useState } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { estadoBadge, FLOW_STEPS } from "./estados";
import { Download, CheckCircle2, XCircle, Link as LinkIcon, Clock } from "lucide-react";

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-1.5 border-b border-neutral-100 text-sm">
    <span className="text-neutral-500">{label}</span>
    <span className="font-medium text-right">{children}</span>
  </div>
);

function Stepper({ estado }) {
  const idx = FLOW_STEPS.findIndex((s) => s.key === estado);
  const rechazado = estado === "rechazado";
  return (
    <div className="flex items-center gap-1 flex-wrap text-[11px]">
      {FLOW_STEPS.map((s, i) => {
        const done = idx >= 0 && i < idx;
        const current = i === idx;
        return (
          <span key={s.key} className={`px-2 py-1 rounded-md border ${
            current ? "bg-neutral-900 text-white border-neutral-900"
            : done ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-neutral-50 text-neutral-400 border-neutral-200"
          }`}>{s.label}</span>
        );
      })}
      {rechazado && <span className="px-2 py-1 rounded-md border bg-red-100 text-red-700 border-red-200">Rechazado</span>}
    </div>
  );
}

export default function ExpenseDetailDialog({ expenseId, open, onOpenChange, onChanged }) {
  const { user } = useAuth();
  const [exp, setExp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [comentario, setComentario] = useState("");
  const [budget, setBudget] = useState("");
  const [inv, setInv] = useState({ url_factura: "", numero_solped: "", fecha_gasto: "", monto_factura: "" });

  const load = () => {
    if (!expenseId) return;
    api.get(`/expenses/${expenseId}`).then((r) => setExp(r.data)).catch((e) => toast.error(formatApiError(e)));
  };
  useEffect(() => { if (open) { setComentario(""); setBudget(""); setInv({ url_factura: "", numero_solped: "", fecha_gasto: "", monto_factura: "" }); load(); } // eslint-disable-next-line
  }, [open, expenseId]);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast.success(okMsg); load(); onChanged && onChanged(); }
    catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const downloadPdf = async () => {
    try {
      const r = await api.get(`/expenses/${expenseId}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = `${exp?.numero || "gasto"}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (!exp) return (
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Cargando…</DialogTitle></DialogHeader></DialogContent></Dialog>
  );

  const role = user?.role;
  const isOwner = exp.solicitante_id === user?.id;
  const b = estadoBadge(exp.estado);
  const dif = exp.monto_factura != null ? Number(exp.monto_factura) - Number(exp.monto) : null;

  // Bloque de acci\u00f3n seg\u00fan etapa/rol
  let action = null;
  if (exp.estado === "pend_coordinador" && (role === "coordinador" || role === "admin")) {
    action = (
      <div className="space-y-3" data-testid="action-coord">
        <Label>Comentario (opcional)</Label>
        <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Observaciones…" />
        <div className="flex gap-2">
          <Button disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" data-testid="btn-coord-aprobar"
            onClick={() => act(() => api.post(`/expenses/${exp.id}/coordinator-decision`, { decision: "aprobar", comentario }), "Solicitud aprobada")}>
            <CheckCircle2 className="w-4 h-4" /> Aprobar
          </Button>
          <Button disabled={busy} variant="destructive" className="gap-2" data-testid="btn-coord-rechazar"
            onClick={() => act(() => api.post(`/expenses/${exp.id}/coordinator-decision`, { decision: "rechazar", comentario }), "Solicitud rechazada")}>
            <XCircle className="w-4 h-4" /> Rechazar
          </Button>
        </div>
      </div>
    );
  } else if (exp.estado === "pend_presupuesto" && (role === "tesorero" || role === "admin")) {
    action = (
      <div className="space-y-3" data-testid="action-budget">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Monto presupuesto</Label><Input type="number" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder={String(exp.monto)} /></div>
        </div>
        <Label>Comentario (opcional)</Label>
        <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} />
        <Button disabled={busy} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="btn-asignar-presupuesto"
          onClick={() => act(() => api.post(`/expenses/${exp.id}/assign-budget`, { monto_presupuesto: budget ? Number(budget) : null, comentario }), "Presupuesto asignado")}>
          <CheckCircle2 className="w-4 h-4" /> Asignar presupuesto
        </Button>
      </div>
    );
  } else if (exp.estado === "pend_factura" && (isOwner || role === "admin")) {
    action = (
      <div className="space-y-3" data-testid="action-invoice">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2"><Label>URL de la factura *</Label><Input value={inv.url_factura} onChange={(e) => setInv((s) => ({ ...s, url_factura: e.target.value }))} placeholder="https://…" /></div>
          <div className="space-y-1"><Label>N° SOLPED *</Label><Input value={inv.numero_solped} onChange={(e) => setInv((s) => ({ ...s, numero_solped: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Fecha del gasto *</Label><Input type="date" value={inv.fecha_gasto} onChange={(e) => setInv((s) => ({ ...s, fecha_gasto: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Monto factura *</Label><Input type="number" step="0.01" value={inv.monto_factura} onChange={(e) => setInv((s) => ({ ...s, monto_factura: e.target.value }))} /></div>
        </div>
        <Button disabled={busy} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="btn-cargar-factura"
          onClick={() => {
            if (!inv.url_factura || !inv.numero_solped || !inv.fecha_gasto || !inv.monto_factura) { toast.error("Completa todos los campos de la factura"); return; }
            act(() => api.post(`/expenses/${exp.id}/invoice`, { ...inv, monto_factura: Number(inv.monto_factura) }), "Factura cargada");
          }}>
          <CheckCircle2 className="w-4 h-4" /> Cargar factura
        </Button>
      </div>
    );
  } else if (exp.estado === "pend_aprob_coordinador" && (role === "coordinador" || role === "admin")) {
    action = (
      <div className="space-y-3" data-testid="action-coord-final">
        <div className="rounded-md bg-neutral-50 border border-neutral-200 p-3 text-sm">
          <div className="flex justify-between"><span className="text-neutral-500">Cotización</span><span className="font-mono">{money(exp.monto)}</span></div>
          <div className="flex justify-between"><span className="text-neutral-500">Factura</span><span className="font-mono">{money(exp.monto_factura)}</span></div>
          <div className="flex justify-between font-semibold"><span>Diferencia</span><span className={`font-mono ${dif > 0 ? "text-red-600" : "text-emerald-600"}`}>{money(dif)}</span></div>
        </div>
        <Label>Comentario de comparación (opcional)</Label>
        <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} />
        <div className="flex gap-2">
          <Button disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" data-testid="btn-coordfinal-aprobar"
            onClick={() => act(() => api.post(`/expenses/${exp.id}/coordinator-final`, { decision: "aprobar", comentario }), "Enviado a gerencia")}>
            <CheckCircle2 className="w-4 h-4" /> Aprobar y enviar a gerencia
          </Button>
          <Button disabled={busy} variant="destructive" className="gap-2" data-testid="btn-coordfinal-rechazar"
            onClick={() => act(() => api.post(`/expenses/${exp.id}/coordinator-final`, { decision: "rechazar", comentario }), "Solicitud rechazada")}>
            <XCircle className="w-4 h-4" /> Rechazar
          </Button>
        </div>
      </div>
    );
  } else if (exp.estado === "pend_aprob_gerencia" && (role === "gerente" || role === "admin")) {
    action = (
      <div className="space-y-3" data-testid="action-gerencia">
        <Label>Comentario (opcional)</Label>
        <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} />
        <div className="flex gap-2">
          <Button disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" data-testid="btn-gerencia-aprobar"
            onClick={() => act(() => api.post(`/expenses/${exp.id}/manager-decision`, { decision: "aprobar", comentario }), "Solicitud aprobada")}>
            <CheckCircle2 className="w-4 h-4" /> Aprobar (Gerencia)
          </Button>
          <Button disabled={busy} variant="destructive" className="gap-2" data-testid="btn-gerencia-rechazar"
            onClick={() => act(() => api.post(`/expenses/${exp.id}/manager-decision`, { decision: "rechazar", comentario }), "Solicitud rechazada")}>
            <XCircle className="w-4 h-4" /> Rechazar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="expense-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {exp.numero}
            <Badge variant="outline" className={b.cls}>{b.label}</Badge>
          </DialogTitle>
          <DialogDescription>{exp.cuenta_nombre} · {exp.proveedor}</DialogDescription>
        </DialogHeader>

        <div className="mb-2"><Stepper estado={exp.estado} /></div>

        <div className="grid md:grid-cols-2 gap-x-6">
          <div>
            <Row label="Solicitante">{exp.solicitante_nombre}</Row>
            <Row label="Ciudad / Región">{exp.ciudad} / {exp.region || "—"}</Row>
            <Row label="Cuenta contable">{exp.cuenta_nombre} <span className="text-neutral-400 font-mono">({exp.cuenta_codigo})</span></Row>
            <Row label="Proveedor">{exp.proveedor}</Row>
            <Row label="Fecha solicitud">{exp.fecha}</Row>
          </div>
          <div>
            <Row label="Monto cotización">{money(exp.monto)}</Row>
            <Row label="¿Requiere presupuesto?">{exp.necesita_presupuesto ? "Sí" : "No"}</Row>
            {exp.presupuesto_asignado && <Row label="Presupuesto asignado">{money(exp.presupuesto_monto)}</Row>}
            {exp.url_cotizacion && <Row label="Cotización"><a href={exp.url_cotizacion} target="_blank" rel="noreferrer" className="text-red-600 inline-flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Ver</a></Row>}
            {exp.url_factura && <Row label="Factura"><a href={exp.url_factura} target="_blank" rel="noreferrer" className="text-red-600 inline-flex items-center gap-1"><LinkIcon className="w-3 h-3" /> Ver</a></Row>}
            {exp.numero_solped && <Row label="N° SOLPED">{exp.numero_solped}</Row>}
            {exp.monto_factura != null && <Row label="Monto factura">{money(exp.monto_factura)}</Row>}
          </div>
        </div>

        {exp.descripcion && <div className="mt-2 text-sm text-neutral-600"><span className="text-neutral-400">Descripción: </span>{exp.descripcion}</div>}

        {exp.estado === "rechazado" && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 p-3 text-sm">
            <div className="font-semibold text-red-700">Rechazado en: {exp.rechazado_etapa}</div>
            <div className="text-red-600">Por @{exp.rechazado_por}: {exp.rechazo_motivo || "sin comentario"}</div>
          </div>
        )}

        {action && <div className="mt-4 rounded-lg border border-neutral-200 p-4 bg-white">{action}</div>}

        {/* Historial */}
        <div className="mt-4">
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2 flex items-center gap-2"><Clock className="w-3 h-3" /> Historial</div>
          <div className="space-y-1">
            {(exp.history || []).map((h, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-neutral-500 border-b border-neutral-100 py-1">
                <span className="font-medium text-neutral-700">{h.accion}</span>
                <span>@{h.usuario} · {String(h.at).slice(0, 19).replace("T", " ")}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="outline" className="gap-2" onClick={downloadPdf} data-testid="btn-download-pdf">
            <Download className="w-4 h-4" /> Descargar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
