import { useEffect, useState } from "react";
import api, { money, numberFmt } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { DollarSign, CheckCircle2, XCircle, Clock, Receipt, MapPin } from "lucide-react";

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

const PIE_COLORS = ["#D92D20", "#F59E0B", "#3B82F6", "#6366F1", "#A855F7", "#F97316", "#10B981", "#EF4444", "#0EA5E9", "#84CC16"];

export default function GastosDashboard() {
  const { user } = useAuth();
  const [dash, setDash] = useState(null);
  const [cities, setCities] = useState([]);
  const [f, setF] = useState({ desde: "", hasta: "", ciudad: "all" });

  const load = () => {
    const p = {};
    if (f.desde) p.desde = f.desde;
    if (f.hasta) p.hasta = f.hasta;
    if (f.ciudad !== "all") p.ciudad = f.ciudad;
    api.get("/expenses/dashboard", { params: p }).then((r) => setDash(r.data));
  };
  useEffect(() => { api.get("/expenses/meta").then((r) => setCities(r.data.cities || [])); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [f]);

  if (!dash) return <div className="p-10 text-neutral-500">Cargando dashboard…</div>;

  const k = dash.kpis;
  const catData = dash.por_categoria.slice(0, 10);
  const cityData = dash.por_ciudad;
  const estadoPie = dash.por_estado;

  return (
    <div className="p-8 space-y-6" data-testid="gastos-dashboard">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Gastos</div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard de gastos</h1>
          <p className="text-sm text-neutral-500 mt-1">Gastos totales, por categoría y ciudad, aprobaciones y tiempos por etapa.</p>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4 border border-neutral-200 shadow-none">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="space-y-1"><Label className="text-xs">Desde</Label><Input type="date" value={f.desde} onChange={(e) => setF((s) => ({ ...s, desde: e.target.value }))} className="w-40" data-testid="dash-desde" /></div>
          <div className="space-y-1"><Label className="text-xs">Hasta</Label><Input type="date" value={f.hasta} onChange={(e) => setF((s) => ({ ...s, hasta: e.target.value }))} className="w-40" data-testid="dash-hasta" /></div>
          <div className="space-y-1">
            <Label className="text-xs">Ciudad</Label>
            <Select value={f.ciudad} onValueChange={(v) => setF((s) => ({ ...s, ciudad: v }))}>
              <SelectTrigger className="w-48" data-testid="dash-ciudad"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="all">Todas las ciudades</SelectItem>
                {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => setF({ desde: "", hasta: "", ciudad: "all" })}>Limpiar</Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <KPI icon={Receipt} label="Solicitudes" value={numberFmt(k.total)} color="text-neutral-700" />
        <KPI icon={DollarSign} label="Monto total" value={money(k.monto_total)} color="text-amber-600" />
        <KPI icon={DollarSign} label="Monto aprobado" value={money(k.monto_aprobado)} color="text-emerald-600" />
        <KPI icon={CheckCircle2} label="Aprobados" value={numberFmt(k.aprobados)} color="text-emerald-600" />
        <KPI icon={XCircle} label="Rechazados" value={numberFmt(k.rechazados)} color="text-red-600" />
        <KPI icon={Clock} label="Pendientes" value={numberFmt(k.pendientes)} color="text-blue-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 border border-neutral-200 shadow-none" data-testid="chart-categoria">
          <h3 className="font-semibold flex items-center gap-2 mb-4"><DollarSign className="w-4 h-4 text-red-600" /> Gasto por categoría</h3>
          {catData.length === 0 ? <div className="py-16 text-center text-neutral-400 text-sm">Sin datos</div> : (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={catData} margin={{ top: 10, right: 10, bottom: 70, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="categoria" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={90} interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => money(v)} />
                <Bar dataKey="monto" name="Monto" fill="#D92D20" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5 border border-neutral-200 shadow-none">
          <h3 className="font-semibold mb-4">Solicitudes por estado</h3>
          {estadoPie.length === 0 ? <div className="py-16 text-center text-neutral-400 text-sm">Sin datos</div> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={estadoPie} dataKey="count" nameKey="label" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {estadoPie.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border border-neutral-200 shadow-none overflow-hidden" data-testid="table-ciudad">
          <div className="px-5 py-3 border-b border-neutral-200"><h3 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-red-600" /> Gasto por ciudad</h3></div>
          <Table>
            <TableHeader><TableRow className="bg-neutral-50">
              <TableHead className="text-xs uppercase">Ciudad</TableHead>
              <TableHead className="text-right text-xs uppercase">Solicitudes</TableHead>
              <TableHead className="text-right text-xs uppercase">Monto</TableHead>
              <TableHead className="text-right text-xs uppercase">Aprob.</TableHead>
              <TableHead className="text-right text-xs uppercase">Rech.</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {cityData.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-neutral-400">Sin datos</TableCell></TableRow>
              : cityData.map((c) => (
                <TableRow key={c.ciudad}>
                  <TableCell className="font-medium">{c.ciudad}</TableCell>
                  <TableCell className="text-right font-mono">{c.count}</TableCell>
                  <TableCell className="text-right font-mono">{money(c.monto)}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-700">{c.aprobados}</TableCell>
                  <TableCell className="text-right font-mono text-red-700">{c.rechazados}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="border border-neutral-200 shadow-none overflow-hidden" data-testid="table-tiempos">
          <div className="px-5 py-3 border-b border-neutral-200"><h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-red-600" /> Tiempo promedio por etapa</h3></div>
          <Table>
            <TableHeader><TableRow className="bg-neutral-50">
              <TableHead className="text-xs uppercase">Etapa</TableHead>
              <TableHead className="text-right text-xs uppercase">Promedio</TableHead>
              <TableHead className="text-right text-xs uppercase">Muestras</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {dash.tiempos_etapa.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-8 text-neutral-400">Sin datos aún</TableCell></TableRow>
              : dash.tiempos_etapa.map((t) => {
                const h = t.promedio_horas;
                const disp = h >= 24 ? `${(h / 24).toFixed(1)} días` : h >= 1 ? `${h.toFixed(1)} h` : `${Math.round(h * 60)} min`;
                return (
                  <TableRow key={t.etapa}>
                    <TableCell className="font-medium">{t.etapa}</TableCell>
                    <TableCell className="text-right font-mono">{disp}</TableCell>
                    <TableCell className="text-right font-mono text-neutral-500">{t.count}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
