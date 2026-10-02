import { useEffect, useState } from "react";
import api, { money, numberFmt } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { Wrench, Users, ClipboardCheck, Ban, DollarSign, MapPin, CheckCircle2 } from "lucide-react";

const KPI = ({ icon: Icon, label, value, sub, color }) => (
  <Card className="p-5 border border-neutral-200 shadow-none">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500">{label}</div>
        <div className="mt-2 text-3xl font-bold font-mono tracking-tight">{value}</div>
        {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
      </div>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
  </Card>
);

export default function ToolsDashboard() {
  const [dash, setDash] = useState(null);
  const [techCount, setTechCount] = useState(0);
  const [activeAssign, setActiveAssign] = useState(0);

  useEffect(() => {
    Promise.all([
      api.get("/tools/dashboard"),
      api.get("/tools/technicians"),
      api.get("/tools/reports/current"),
    ]).then(([d, tech, cur]) => {
      setDash(d.data);
      setTechCount(tech.data.length);
      setActiveAssign(cur.data.length);
    });
  }, []);

  if (!dash) return <div className="p-10 text-neutral-500">Cargando dashboard…</div>;

  const chartData = dash.ciudades.slice(0, 12);
  const pieData = [
    { name: "Activas", value: dash.kpis.total_activa },
    { name: "Inactivas", value: dash.kpis.total_inactiva },
  ];

  return (
    <div className="p-8 space-y-6" data-testid="tools-home">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Módulo</div>
        <h1 className="text-3xl font-bold tracking-tight">Herramientas — Dashboard</h1>
        <p className="text-sm text-neutral-500 mt-1">Valor total en dólares por centro (ciudad) según el último técnico asignado.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <KPI icon={Wrench} label="Herramientas" value={numberFmt(dash.kpis.count_tools)} sub={`${dash.kpis.count_activas} activas`} color="text-neutral-700" />
        <KPI icon={CheckCircle2} label="Valor Activas" value={money(dash.kpis.total_activa)} color="text-emerald-600" />
        <KPI icon={Ban} label="Valor Inactivas" value={money(dash.kpis.total_inactiva)} sub={`${dash.kpis.count_inactivas} unidades`} color="text-red-600" />
        <KPI icon={DollarSign} label="Valor Total" value={money(dash.kpis.total_valor)} color="text-amber-600" />
        <KPI icon={Users} label="Técnicos" value={numberFmt(techCount)} color="text-blue-600" />
        <KPI icon={ClipboardCheck} label="Vigentes" value={numberFmt(activeAssign)} color="text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 border border-neutral-200 shadow-none" data-testid="chart-valor-ciudad">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-red-600" /> Valor por Ciudad</h3>
              <p className="text-xs text-neutral-500">Herramientas Activas vs Inactivas (USD)</p>
            </div>
            <div className="text-xs text-neutral-500">{dash.ciudades.length} ciudades</div>
          </div>
          {chartData.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 text-sm">Sin datos aún. Crea herramientas y asígnalas para poblar este dashboard.</div>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 40, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="ciudad" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="activa" name="Activas" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="inactiva" name="Inactivas" stackId="a" fill="#0033a0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5 border border-neutral-200 shadow-none">
          <div className="mb-4">
            <h3 className="font-semibold">Distribución global</h3>
            <p className="text-xs text-neutral-500">Activas vs Inactivas</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" innerRadius={55} outerRadius={90} paddingAngle={2}>
                <Cell fill="#10B981" />
                <Cell fill="#0033a0" />
              </Pie>
              <Tooltip formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="border border-neutral-200 shadow-none overflow-hidden" data-testid="table-por-ciudad">
        <div className="px-5 py-3 border-b border-neutral-200 bg-white">
          <h3 className="font-semibold">Detalle por Ciudad</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
              <TableHead className="text-xs uppercase tracking-wider">Ciudad</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Unidades activas</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Valor activas</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Unidades inactivas</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Valor inactivas</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dash.ciudades.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-neutral-500">Sin datos</TableCell></TableRow>
            ) : dash.ciudades.map((c) => (
              <TableRow key={c.ciudad}>
                <TableCell>
                  {c.ciudad === "Sin ciudad" ? <Badge variant="secondary">{c.ciudad}</Badge> : <span className="font-medium">{c.ciudad}</span>}
                </TableCell>
                <TableCell className="text-right font-mono">{c.activa_count}</TableCell>
                <TableCell className="text-right font-mono text-emerald-700">{money(c.activa)}</TableCell>
                <TableCell className="text-right font-mono">{c.inactiva_count}</TableCell>
                <TableCell className="text-right font-mono text-red-700">{money(c.inactiva)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{money(c.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
