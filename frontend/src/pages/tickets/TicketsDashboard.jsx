import { useOutletContext, Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { AlertTriangle } from "lucide-react";
import { ESTADOS, ESTADO_STYLE } from "./estados";

const Kpi = ({ label, value, color, testId }) => (
  <div className="bg-white border border-neutral-200 rounded-lg p-4" data-testid={testId}>
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-500">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} /> {label}
    </div>
    <div className="text-3xl font-bold mt-2 tabular-nums">{value}</div>
  </div>
);

export default function TicketsDashboard() {
  const { data, loading } = useOutletContext();
  const chart = ESTADOS.map((e) => ({ estado: e, total: data.counts?.[e] || 0 }));
  const slug = (e) => e.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-5" data-testid="ts-dashboard">
      {data.sin_asignar > 0 && (
        <Link to="/tickets/listado" className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="ts-unassigned-warning">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
          <span><b>{data.sin_asignar}</b> ticket(s) sin analista asignado: no existe analista responsable para la región del técnico. Ábrelos para asignarlos manualmente o configura la región.</span>
        </Link>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Total" value={data.total} color="#111827" testId="ts-kpi-total" />
        {ESTADOS.map((e) => (
          <Kpi key={e} label={e} value={data.counts?.[e] || 0} color={ESTADO_STYLE[e].color} testId={`ts-kpi-${slug(e)}`} />
        ))}
      </div>
      <div className="bg-white border border-neutral-200 rounded-lg p-4" data-testid="ts-chart">
        <div className="text-sm font-semibold mb-3">Tickets por estado {loading && <span className="text-xs text-neutral-400 font-normal">· actualizando…</span>}</div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chart} margin={{ top: 10, right: 10, bottom: 10, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="estado" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={55} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="total" name="Tickets" radius={[4, 4, 0, 0]}>
              {chart.map((c) => <Cell key={c.estado} fill={ESTADO_STYLE[c.estado].color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
