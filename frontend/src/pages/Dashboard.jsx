import { useEffect, useState, useCallback } from "react";
import api, { money, numberFmt } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CityFilter from "@/components/CityFilter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ComposedChart,
} from "recharts";
import { Truck, DollarSign, Users, Gauge, Wrench, AlertTriangle, Fuel, Calendar, MapPin } from "lucide-react";

const COLORS = ["#D92D20", "#2563EB", "#10B981", "#F59E0B", "#7C3AED", "#EC4899", "#0EA5E9", "#84CC16"];

const KPI = ({ icon: Icon, label, value, sub, testId }) => (
  <Card className="p-5 border border-neutral-200 shadow-none" data-testid={testId}>
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500">{label}</div>
        <div className="mt-2 text-3xl font-bold font-mono tracking-tight">{value}</div>
        {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
      </div>
      <div className="w-9 h-9 rounded-md bg-neutral-100 flex items-center justify-center">
        <Icon className="w-4 h-4 text-neutral-700" />
      </div>
    </div>
  </Card>
);

export default function Dashboard() {
  const { isAdmin, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cityFilter, setCityFilter] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fleet_city_filter") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem("fleet_city_filter", JSON.stringify(cityFilter));
  }, [cityFilter]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    if (isAdmin && cityFilter.length > 0) params.ciudades = cityFilter.join(",");
    try {
      const { data } = await api.get("/dashboard", { params });
      setData(data);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, cityFilter, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const clearFilters = () => { setDesde(""); setHasta(""); };

  if (loading && !data) return <div className="p-10 text-neutral-500">Cargando dashboard…</div>;
  if (!data) return null;

  const topVehiculos = data.gasto_por_vehiculo.slice(0, 10);
  const consumo = data.consumo_por_vehiculo.slice(0, 12);
  const consumoCombustible = (data.consumo_combustible || []).slice(0, 15);

  return (
    <div className="p-8 space-y-6" data-testid="dashboard-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Panel de Control</div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Indicadores operativos y financieros de la flota.
            {!isAdmin && user?.ciudad && <span className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-800 rounded"><MapPin className="w-3 h-3" /> {user.ciudad}</span>}
          </p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          {isAdmin && (
            <div className="flex items-end pb-1">
              <CityFilter selected={cityFilter} onChange={setCityFilter} testId="dashboard-city-filter" />
            </div>
          )}
          <div className="flex items-end gap-2 bg-white border border-neutral-200 rounded-md p-3">
            <Calendar className="w-4 h-4 text-neutral-500 mb-2" />
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" data-testid="filter-desde" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" data-testid="filter-hasta" />
            </div>
            {(desde || hasta) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="filter-clear">Limpiar</Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <KPI icon={Truck} label="Vehículos" value={numberFmt(data.kpis.total_vehiculos)} testId="kpi-vehiculos" />
        <KPI icon={Users} label="Conductores" value={numberFmt(data.kpis.total_conductores)} testId="kpi-conductores" />
        <KPI icon={DollarSign} label="Gasto Total" value={money(data.kpis.gasto_total)} testId="kpi-gasto" />
        <KPI icon={Wrench} label="Mnto Total" value={money(data.kpis.gasto_mantenimiento)} testId="kpi-mnto" />
        <KPI icon={Fuel} label="Galones" value={numberFmt(data.kpis.total_galones || 0)} sub="en período" testId="kpi-gal" />
        <KPI icon={Gauge} label="Rendimiento" value={`${numberFmt(data.kpis.km_por_galon_prom || 0)}`} sub="km/gal promedio" testId="kpi-km-gal" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 border border-neutral-200 shadow-none lg:col-span-2" data-testid="chart-gasto-vehiculo">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Gasto Total por Vehículo</h3>
              <p className="text-xs text-neutral-500">Top 10 · seguros + impuestos + multas + mantenimiento</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topVehiculos}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="placa" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="gasto" fill="#D92D20" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5 border border-neutral-200 shadow-none" data-testid="chart-gasto-ciudad">
          <div className="mb-4">
            <h3 className="font-semibold">Gasto por Ciudad</h3>
            <p className="text-xs text-neutral-500">Distribución geográfica</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={data.gasto_por_ciudad} dataKey="gasto" nameKey="ciudad" cx="50%" cy="45%" innerRadius={60} outerRadius={95} paddingAngle={2}>
                {data.gasto_por_ciudad.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
              </Pie>
              <Tooltip formatter={(v) => money(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* NEW: Fuel consumption chart with date filters */}
      <Card className="p-5 border border-neutral-200 shadow-none" data-testid="chart-consumo-combustible">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Fuel className="w-4 h-4 text-blue-600" /> Consumo de Combustible por Vehículo (Km/gal)
            </h3>
            <p className="text-xs text-neutral-500">
              {desde || hasta ? `Período: ${desde || "inicio"} → ${hasta || "hoy"}` : "Todo el histórico"} · Top 15 vehículos
            </p>
          </div>
          <div className="text-xs text-neutral-500">
            Promedio flota: <span className="font-mono font-semibold text-neutral-900">{numberFmt(data.kpis.km_por_galon_prom || 0)} km/gal</span>
          </div>
        </div>
        {consumoCombustible.length === 0 ? (
          <div className="text-center py-16 text-neutral-500 text-sm">Sin datos de combustible en el período seleccionado</div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={consumoCombustible}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="placa" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={70} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: "Km/gal", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#6B7280" } }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} label={{ value: "Km", angle: 90, position: "insideRight", style: { fontSize: 11, fill: "#6B7280" } }} />
              <Tooltip formatter={(v, name) => name === "Km recorridos" ? `${numberFmt(v)} km` : `${numberFmt(v)} km/gal`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="right" dataKey="km_recorridos" name="Km recorridos" fill="#93C5FD" radius={[4, 4, 0, 0]} />
              <Line yAxisId="left" type="monotone" dataKey="km_por_galon" name="Rendimiento (km/gal)" stroke="#D92D20" strokeWidth={2.5} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 border border-neutral-200 shadow-none" data-testid="chart-multas">
          <div className="mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" /> Multas por Conductor
            </h3>
            <p className="text-xs text-neutral-500">Detalle por usuario</p>
          </div>
          {data.multas_por_conductor.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 text-sm">Sin multas registradas</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-b border-neutral-200">
                  <tr className="text-xs uppercase tracking-wider text-neutral-500">
                    <th className="py-2 pr-2">Conductor</th>
                    <th className="py-2 px-2 text-right">Cant.</th>
                    <th className="py-2 px-2 text-right">Multa</th>
                    <th className="py-2 px-2 text-right">Pagado</th>
                    <th className="py-2 pl-2 text-right">Debe</th>
                  </tr>
                </thead>
                <tbody>
                  {data.multas_por_conductor.map((m) => (
                    <tr key={m.conductor} className="border-b border-neutral-100 last:border-0">
                      <td className="py-2 pr-2 font-medium truncate max-w-[220px]">{m.conductor}</td>
                      <td className="py-2 px-2 text-right font-mono">{m.cantidad}</td>
                      <td className="py-2 px-2 text-right font-mono">{money(m.total)}</td>
                      <td className="py-2 px-2 text-right font-mono text-emerald-700">{money(m.pagado)}</td>
                      <td className="py-2 pl-2 text-right font-mono text-red-700">{money(m.debe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5 border border-neutral-200 shadow-none" data-testid="chart-consumo">
          <div className="mb-4">
            <h3 className="font-semibold">Kilometraje por Vehículo</h3>
            <p className="text-xs text-neutral-500">Km recorridos · Promedio: {numberFmt(data.kpis.km_promedio)} km/vehículo</p>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={consumo}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="placa" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => `${numberFmt(v)} km`} />
              <Line type="monotone" dataKey="km_recorridos" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
