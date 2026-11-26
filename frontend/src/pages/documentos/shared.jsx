import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export const PENDIENTE = "Pendiente de recepción";
export const RECIBIDO = "Recibido";
export const TIPOS = ["Contrato", "Acta de entrega", "Capacitación"];

export const fmtDateTime = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
};

export const EstadoBadge = ({ estado }) => {
  const pend = estado === PENDIENTE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
        pend ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      }`}
      data-testid="doc-estado-badge"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${pend ? "bg-amber-500" : "bg-emerald-500"}`} />
      {estado}
    </span>
  );
};

export const downloadActa = async (d) => {
  try {
    const res = await api.get(`/docs/entregas/${d.id}/acta`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `acta_${d.codigo}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    toast.error(formatApiError(e));
  }
};
