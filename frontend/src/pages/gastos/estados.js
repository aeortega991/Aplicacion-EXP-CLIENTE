// Estados del flujo de gastos y utilidades de presentación
export const ESTADO_STYLE = {
  pend_coordinador: { label: "Pend. coordinador", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  pend_presupuesto: { label: "Pend. presupuesto", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  pend_factura: { label: "Pend. factura", cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  pend_aprob_coordinador: { label: "Pend. aprob. coord.", cls: "bg-purple-100 text-purple-800 border-purple-200" },
  pend_aprob_gerencia: { label: "Pend. gerencia", cls: "bg-orange-100 text-orange-800 border-orange-200" },
  aprobado: { label: "Aprobado", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  rechazado: { label: "Rechazado", cls: "bg-red-100 text-red-800 border-red-200" },
};

export const FLOW_STEPS = [
  { key: "solicitud", label: "Solicitud" },
  { key: "pend_coordinador", label: "Aprob. coordinador" },
  { key: "pend_presupuesto", label: "Presupuesto" },
  { key: "pend_factura", label: "Factura" },
  { key: "pend_aprob_coordinador", label: "Aprob. final coord." },
  { key: "pend_aprob_gerencia", label: "Gerencia" },
  { key: "aprobado", label: "Aprobado" },
];

export function estadoBadge(estado) {
  return ESTADO_STYLE[estado] || { label: estado, cls: "bg-neutral-100 text-neutral-700 border-neutral-200" };
}
