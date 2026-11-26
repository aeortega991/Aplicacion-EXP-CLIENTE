import { useParams } from "react-router-dom";
import { Construction } from "lucide-react";

const PAGES = {
  dashboard: { title: "Dashboard", summary: "Indicadores de pagos y tickets por período." },
  talleres: { title: "Talleres tercerizados", summary: "Registro de prestadores de servicio técnico identificados por código SAP." },
  tarifarios: { title: "Tarifarios", summary: "Tarifas independientes para Línea Blanca y Línea Café." },
  codificador: { title: "Codificador ACT", summary: "Importación y consulta de resoluciones y pesos." },
  promociones: { title: "Promociones comerciales", summary: "Configuración de tickets asumidos por Comercial." },
  importacion: { title: "Importación SAP", summary: "Carga y validación de archivos de tickets." },
  liquidaciones: { title: "Liquidaciones", summary: "Clasificación de tickets, kilometrajes y generación de Excel." },
  historial: { title: "Historial de pagos", summary: "Consulta de reportes generados." },
};

/** Página indicativa de Fase 1; evita presentar operaciones aún no implementadas. */
export default function TallerPayPage({ section = "dashboard" }) {
  const data = PAGES[section] || PAGES.dashboard;
  return (
    <div className="p-8 max-w-5xl" data-testid={`tallerpay-${section}`}>
      <p className="text-xs uppercase tracking-widest text-neutral-500">Pago a talleres</p>
      <h2 className="text-3xl font-bold mt-2">{data.title}</h2>
      <p className="text-neutral-600 mt-3">{data.summary}</p>
      <div className="mt-8 p-6 rounded-lg border bg-white flex items-start gap-3" role="status">
        <Construction className="w-6 h-6 text-amber-600 shrink-0" />
        <div>
          <h3 className="font-semibold">Estructura preparada — Fase 1</h3>
          <p className="text-sm text-neutral-600 mt-1">
            La navegación y los permisos están integrados. Esta sección todavía no procesa
            operaciones ni genera liquidaciones.
          </p>
        </div>
      </div>
    </div>
  );
}
