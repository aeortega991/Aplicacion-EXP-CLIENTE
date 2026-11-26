import { useCallback, useEffect, useState } from "react";
import { useParams, useOutletContext, Link } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Lock } from "lucide-react";
import { ESTADOS, StatusBadge, fmtDT } from "./estados";
import { TicketMedia } from "./TicketMedia";
import { TicketResponse } from "./TicketResponse";
import { TicketChat } from "./TicketChat";

const Field = ({ label, children, testId }) => (
  <div className="min-w-0">
    <div className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</div>
    <div className="text-sm font-medium break-words" data-testid={testId}>{children || "—"}</div>
  </div>
);

const TicketInfo = ({ t }) => (
  <section className="bg-white border border-neutral-200 rounded-lg p-4 space-y-4" data-testid="ts-info">
    <div className="flex items-center gap-2"><h2 className="text-base font-semibold">Información de la solicitud</h2><Lock className="w-3.5 h-3.5 text-neutral-400" /></div>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <Field label="Ticket" testId="ts-info-numero">{t.numero}</Field>
      <Field label="Estado"><StatusBadge estado={t.estado} testId="ts-info-estado" /></Field>
      <Field label="Técnico solicitante" testId="ts-info-tecnico">{t.tecnico_nombre}</Field>
      <Field label="Ciudad / Región" testId="ts-info-ciudad">{`${t.ciudad || "—"} / ${t.region_nombre || "—"}`}</Field>
      <Field label="Analista asignado" testId="ts-info-analista">{t.analista_nombre || "Sin asignar"}</Field>
      <Field label="Creación">{fmtDT(t.created_at)}</Field>
      <Field label="Modelo" testId="ts-info-modelo">{t.modelo}</Field>
      <Field label="Serie" testId="ts-info-serie">{t.serie}</Field>
      {t.closed_at && <Field label="Cierre" testId="ts-info-closed">{fmtDT(t.closed_at)}</Field>}
    </div>
    <Field label="Descripción del daño"><p className="whitespace-pre-wrap font-normal">{t.descripcion}</p></Field>
    <Field label="Mediciones y valores"><p className="whitespace-pre-wrap font-normal" data-testid="ts-detail-mediciones">{t.mediciones || "—"}</p></Field>
    <div className="grid sm:grid-cols-2 gap-3">{(t.media || []).map((m) => <TicketMedia key={m.id} media={m} />)}</div>
  </section>
);

const StatePanel = ({ t, onChanged }) => {
  const [estado, setEstado] = useState(t.estado);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => setEstado(t.estado), [t.estado]);
  const save = async () => {
    setSaving(true);
    try { await api.put(`/ts/tickets/${t.id}/estado`, { estado }); toast.success(`Estado actualizado a ${estado}`); onChanged(); }
    catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); setConfirmClose(false); }
  };
  const onUpdate = () => (estado === "Cerrado" ? setConfirmClose(true) : save());
  return (
    <section className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3" data-testid="ts-state-panel">
      <h2 className="text-base font-semibold">Estado</h2>
      <div className="flex gap-2">
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger data-testid="ts-state-select"><SelectValue /></SelectTrigger>
          <SelectContent>{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={onUpdate} disabled={saving || estado === t.estado} className="bg-[#0033A0] hover:bg-[#002a85]" data-testid="ts-state-save">Actualizar</Button>
      </div>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent data-testid="ts-close-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar el ticket {t.numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              Una vez cerrado, el ticket queda bloqueado: no se podrá cambiar su estado, editar la respuesta técnica, reasignarlo ni enviar mensajes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); save(); }} disabled={saving} data-testid="ts-close-confirm-btn">Sí, cerrar ticket</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

const ReassignPanel = ({ t, onChanged }) => {
  const [analysts, setAnalysts] = useState([]);
  const [aid, setAid] = useState(t.analista_id || "");
  useEffect(() => { api.get("/ts/analysts").then((r) => setAnalysts(r.data || [])).catch(() => {}); }, []);
  const save = async () => {
    try { await api.put(`/ts/tickets/${t.id}/asignar`, { analista_id: aid }); toast.success("Ticket asignado"); onChanged(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  return (
    <section className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3" data-testid="ts-reassign-panel">
      <h2 className="text-base font-semibold">{t.analista_id ? "Reasignar analista" : "Asignar analista"}</h2>
      {!t.analista_id && <p className="text-xs text-amber-700">No existe analista responsable para la región; asígnalo manualmente.</p>}
      <div className="flex gap-2">
        <Select value={aid} onValueChange={setAid}>
          <SelectTrigger data-testid="ts-reassign-select"><SelectValue placeholder="Selecciona analista" /></SelectTrigger>
          <SelectContent>{analysts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}{a.region ? ` · ${a.region}` : ""}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={save} disabled={!aid || aid === t.analista_id} variant="outline" data-testid="ts-reassign-save">Asignar</Button>
      </div>
    </section>
  );
};

const History = ({ items }) => (
  <section className="bg-white border border-neutral-200 rounded-lg p-4" data-testid="ts-history">
    <h2 className="text-base font-semibold mb-3">Historial de estados</h2>
    <ol className="space-y-2">
      {items.map((h) => (
        <li key={h.id} className="text-xs text-neutral-600 border-l-2 border-neutral-200 pl-3">
          <div><b>{h.de || "—"}</b> → <b>{h.a}</b></div>
          <div className="text-neutral-400">{h.user_name} · {fmtDT(h.created_at)}</div>
        </li>
      ))}
    </ol>
  </section>
);

export default function TicketDetail() {
  const { id } = useParams();
  const { reload } = useOutletContext();
  const { user } = useAuth();
  const [t, setT] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    api.get(`/ts/tickets/${id}`).then((r) => setT(r.data)).catch((e) => setError(formatApiError(e)));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const refresh = () => { load(); reload(); };

  if (error) return (
    <div className="bg-white border border-neutral-200 rounded-lg p-8 text-center space-y-3" data-testid="ts-detail-error">
      <div className="text-sm text-neutral-600">{error}</div>
      <Link to="/tickets/listado" className="text-sm text-[#0033A0] hover:underline">Volver al listado</Link>
    </div>
  );
  if (!t) return <div className="text-sm text-neutral-500">Cargando…</div>;

  return (
    <div className="space-y-4" data-testid="ts-detail">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/tickets/listado" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-[#0033A0]"><ArrowLeft className="w-4 h-4" /> Listado</Link>
        <h1 className="text-2xl font-bold tracking-tight">{t.numero}</h1>
        <StatusBadge estado={t.estado} testId="ts-detail-estado" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <TicketInfo t={t} />
          <TicketResponse ticket={t} onSaved={refresh} />
        </div>
        <div className="space-y-4">
          {t.perms?.locked && (
            <section className="rounded-lg border border-neutral-300 bg-neutral-100 p-4 flex gap-3" data-testid="ts-locked-banner">
              <Lock className="w-5 h-5 text-neutral-500 shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">Ticket cerrado</div>
                <div className="text-neutral-600">Este ticket fue cerrado{t.closed_at ? ` el ${fmtDT(t.closed_at)}` : ""} y ya no puede ser editado.</div>
              </div>
            </section>
          )}
          {t.perms?.can_change_state && <StatePanel t={t} onChanged={refresh} />}
          {user?.role === "admin" && t.perms?.can_reassign && <ReassignPanel t={t} onChanged={refresh} />}
          <TicketChat ticket={t} onSent={reload} />
          <History items={t.history || []} />
        </div>
      </div>
    </div>
  );
}
