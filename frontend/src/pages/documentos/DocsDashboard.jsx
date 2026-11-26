import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Files, Clock, CheckCircle2, Loader2 } from "lucide-react";

const Kpi = ({ icon: Icon, label, value, tone, testId }) => (
  <div className="rounded-lg border border-neutral-200 bg-white p-5 flex items-center gap-4" data-testid={testId}>
    <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${tone}`}><Icon className="w-5 h-5" /></div>
    <div>
      <div className="text-[11px] uppercase tracking-widest text-neutral-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  </div>
);

const ChartCard = ({ title, data, testId, height = 300 }) => (
  <div className="rounded-lg border border-neutral-200 bg-white p-5" data-testid={testId}>
    <div className="text-sm font-semibold mb-4">{title}</div>
    {data.every((d) => !d.total) ? (
      <div className="h-[200px] flex items-center justify-center text-sm text-neutral-400">Sin datos todavía</div>
    ) : (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={data.length > 6 ? -30 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 60 : 30} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="recibidas" name="Recibidas" stackId="a" fill="#0033A0" />
          <Bar dataKey="pendientes" name="Pendientes" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )}
  </div>
);

export default function DocsDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/docs/dashboard").then(({ data }) => setData(data)).catch((e) => toast.error(formatApiError(e)));
  }, []);
  if (!data) return <div className="p-10 text-sm text-neutral-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>;
  const { kpis } = data;
  return (
    <div className="space-y-5" data-testid="docs-dashboard">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500">Administración</div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard general</h1>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi icon={Files} label="Entregas" value={kpis.total} tone="bg-[#0033A0]/10 text-[#0033A0]" testId="docs-kpi-total" />
        <Kpi icon={Clock} label="Pendientes" value={kpis.pendientes} tone="bg-amber-100 text-amber-700" testId="docs-kpi-pendientes" />
        <Kpi icon={CheckCircle2} label="Recibidas" value={kpis.recibidas} tone="bg-emerald-100 text-emerald-700" testId="docs-kpi-recibidas" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Entregas por ciudad" data={data.por_ciudad} testId="docs-chart-ciudad" />
        <ChartCard title="Entregas por tipo de documento" data={data.por_tipo} testId="docs-chart-tipo" />
      </div>
    </div>
  );
}
