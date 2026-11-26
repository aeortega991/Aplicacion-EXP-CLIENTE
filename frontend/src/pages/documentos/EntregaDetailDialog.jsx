import { useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Download, ExternalLink, Users } from "lucide-react";
import { EstadoBadge, PENDIENTE, downloadActa, fmtDateTime } from "./shared";

const Row = ({ k, v }) => (
  <div className="grid grid-cols-[140px_1fr] gap-3 py-2 border-b border-neutral-100 text-sm">
    <div className="text-neutral-500">{k}</div>
    <div className="text-neutral-900 break-words">{v}</div>
  </div>
);

export const AcceptConfirm = ({ entrega, open, onOpenChange, onAccepted }) => {
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/docs/entregas/${entrega.id}/aceptar`);
      toast.success(`Entrega ${data.codigo} aceptada`);
      onAccepted?.(data);
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="docs-accept-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Confirmas la recepción?</AlertDialogTitle>
          <AlertDialogDescription>
            Vas a aceptar la entrega <b>{entrega?.codigo}</b> ({entrega?.tipo}) enviada por {entrega?.emisor_nombre}. Se registrará la fecha y hora de recepción y no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); accept(); }} disabled={busy}
            className="bg-emerald-600 hover:bg-emerald-700" data-testid="docs-accept-confirm-btn">
            Sí, acepto la entrega
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default function EntregaDetailDialog({ entrega, onOpenChange, onChanged }) {
  const { user } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const d = entrega;
  const canAccept = d && d.receptor_id === user?.id && d.estado === PENDIENTE;
  const cap = d?.capacitacion;
  return (
    <Dialog open={!!d} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="docs-detail-dialog">
        {d && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-3">
                <span className="font-mono" data-testid="docs-detail-codigo">{d.codigo}</span>
                <EstadoBadge estado={d.estado} />
              </DialogTitle>
            </DialogHeader>
            <div>
              <Row k="Tipo de documento" v={d.tipo} />
              <Row k="Usuario que entrega" v={d.emisor_nombre} />
              <Row k="Usuario que recibe" v={d.receptor_nombre} />
              <Row k="Ciudad" v={d.ciudad} />
              <Row k="Fecha y hora" v={fmtDateTime(d.created_at)} />
              <Row k="Recepción" v={d.aceptado_at ? fmtDateTime(d.aceptado_at) : "Pendiente"} />
              <Row k="Documento" v={
                <a href={d.documento_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#0033A0] hover:underline break-all" data-testid="docs-detail-url">
                  {d.documento_url} <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              } />
            </div>
            {cap && (
              <div className="rounded-lg border border-[#0033A0]/20 bg-[#0033A0]/[0.03] p-4" data-testid="docs-detail-cap">
                <div className="text-sm font-semibold text-[#0033A0] mb-1">Capacitación</div>
                <Row k="Tema" v={cap.tema} />
                <Row k="Capacitador" v={cap.capacitador} />
                <Row k="Lugar" v={cap.lugar} />
                <div className="pt-3 text-sm">
                  <div className="flex items-center gap-1 text-neutral-500 mb-2"><Users className="w-4 h-4" /> Participantes ({cap.participantes.length})</div>
                  <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 list-decimal list-inside text-neutral-800">
                    {cap.participantes.map((p, i) => <li key={`${p}-${i}`} className="truncate">{p}</li>)}
                  </ol>
                </div>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button variant="outline" className="gap-2" onClick={() => downloadActa(d)} data-testid="docs-detail-acta"><Download className="w-4 h-4" /> Descargar acta</Button>
              {canAccept && (
                <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setConfirm(true)} data-testid="docs-detail-accept">
                  <CheckCircle2 className="w-4 h-4" /> Aceptar entrega
                </Button>
              )}
            </div>
            <AcceptConfirm entrega={d} open={confirm} onOpenChange={setConfirm} onAccepted={(upd) => onChanged?.(upd)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
