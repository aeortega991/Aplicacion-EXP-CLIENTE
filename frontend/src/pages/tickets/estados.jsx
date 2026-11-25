export const ESTADOS = ["Creado", "Asignado", "Info cargada", "Bloqueado", "Cerrado"];

export const ESTADO_STYLE = {
  Creado: { badge: "bg-neutral-100 text-neutral-700 border-neutral-300", dot: "bg-neutral-400", color: "#9ca3af" },
  Asignado: { badge: "bg-blue-50 text-[#0033A0] border-blue-200", dot: "bg-[#0033A0]", color: "#0033a0" },
  "Info cargada": { badge: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-600", color: "#7c3aed" },
  Bloqueado: { badge: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-600", color: "#dc2626" },
  Cerrado: { badge: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-600", color: "#16a34a" },
};

export const StatusBadge = ({ estado, testId }) => {
  const s = ESTADO_STYLE[estado] || ESTADO_STYLE.Creado;
  return (
    <span data-testid={testId} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {estado}
    </span>
  );
};

export const fmtDT = (iso) =>
  iso ? new Date(iso).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" }) : "—";
