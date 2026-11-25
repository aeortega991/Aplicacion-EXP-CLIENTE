import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api, { money, numberFmt } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Car, DollarSign, ShieldCheck, FileText, Wrench, AlertTriangle, Route as RouteIcon, Fuel, Gauge, MapPin } from "lucide-react";
import { toast } from "sonner";

const fmtDate = (v) => { if (!v) return "—"; try { return new Date(v).toLocaleDateString("es-EC"); } catch { return String(v); } };

export default function VehicleHistory() {
  const { placa: paramPlaca } = useParams();
  const [mode, setMode] = useState("individual"); // 'individual' | 'resumen'
  const [vehicles, setVehicles] = useState([]);
  const [placas, setPlacas] = useState([]);
  const [selected, setSelected] = useState(paramPlaca || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Resumen por periodo
  const [sumCiudad, setSumCiudad] = useState("all");
  const [sumPlacas, setSumPlacas] = useState([]); // array de placas seleccionadas
  const [sumDesde, setSumDesde] = useState("");
  const [sumHasta, setSumHasta] = useState("");
  const [sumData, setSumData] = useState(null);
  const [sumLoading, setSumLoading] = useState(false);

  useEffect(() => {
    api.get("/modules/flota").then((r) => {
      setVehicles(r.data || []);
      setPlacas([...new Set((r.data || []).map((v) => v["Placa Vehiculo"]).filter(Boolean))].sort());
    });
  }, []);

  const cities = useMemo(
    () => [...new Set(vehicles.map((v) => v.Ubicacion).filter(Boolean))].sort(),
    [vehicles]
  );
  // Placas disponibles para el multi-select según la ciudad elegida
  const sumPlacaOptions = useMemo(() => {
    let vs = vehicles;
    if (sumCiudad !== "all") vs = vs.filter((v) => v.Ubicacion === sumCiudad);
    return [...new Set(vs.map((v) => v["Placa Vehiculo"]).filter(Boolean))].sort();
  }, [vehicles, sumCiudad]);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    api.get(`/vehicles/${encodeURIComponent(selected)}/history`)
      .then((r) => setData(r.data))
      .catch(() => toast.error("Error al cargar historial"))
      .finally(() => setLoading(false));
  }, [selected]);

  const toggleSumPlaca = (p) => {
    setSumPlacas((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  };

  const generarResumen = () => {
    setSumLoading(true);
    const params = {};
    if (sumPlacas.length) params.placas = sumPlacas.join(",");
    if (sumCiudad !== "all") params.ciudad = sumCiudad;
    if (sumDesde) params.desde = sumDesde;
    if (sumHasta) params.hasta = sumHasta;
    api.get("/vehicles/history/summary", { params })
      .then((r) => setSumData(r.data))
      .catch(() => toast.error("Error al generar resumen"))
      .finally(() => setSumLoading(false));
  };

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/vehicles/${encodeURIComponent(selected)}/history/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `historial_${selected}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF descargado");
    } catch { toast.error("Error al generar PDF"); }
  };

  return (
    <div className="p-8 space-y-6" data-testid="vehicle-history-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Vehículo</div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Car className="w-7 h-7 text-red-600" /> Historial Vehicular
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Ficha por placa o resumen de kilómetros y consumo por periodo.</p>
        </div>
        <div className="flex items-end gap-3">
          {mode === "individual" && (
            <>
              <div className="space-y-1 min-w-[220px]">
                <label className="text-xs font-medium text-neutral-600">Seleccionar placa</label>
                <Select value={selected} onValueChange={setSelected}>
                  <SelectTrigger data-testid="history-placa-select"><SelectValue placeholder="Elegir vehículo…" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {placas.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={downloadPdf} disabled={!selected || !data} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="history-pdf-btn">
                <Download className="w-4 h-4" /> Exportar PDF
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Toggle de modo */}
      <div className="inline-flex rounded-lg border border-neutral-200 p-1 bg-white">
        <button
          onClick={() => setMode("individual")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "individual" ? "bg-red-600 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
          data-testid="history-mode-individual"
        >Por vehículo</button>
        <button
          onClick={() => setMode("resumen")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "resumen" ? "bg-red-600 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
          data-testid="history-mode-resumen"
        >Resumen por periodo</button>
      </div>

      {mode === "resumen" && (
        <div className="space-y-6" data-testid="history-summary">
          <Card className="p-4 border border-neutral-200 shadow-none">
            <div className="grid md:grid-cols-4 gap-4 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Ciudad</Label>
                <Select value={sumCiudad} onValueChange={(v) => { setSumCiudad(v); setSumPlacas([]); }}>
                  <SelectTrigger data-testid="sum-ciudad"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="all">Todas las ciudades</SelectItem>
                    {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Desde (fecha salida)</Label>
                <Input type="date" value={sumDesde} onChange={(e) => setSumDesde(e.target.value)} data-testid="sum-desde" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <Input type="date" value={sumHasta} onChange={(e) => setSumHasta(e.target.value)} data-testid="sum-hasta" />
              </div>
              <Button onClick={generarResumen} disabled={sumLoading} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="sum-generar">
                <Gauge className="w-4 h-4" /> {sumLoading ? "Generando…" : "Generar resumen"}
              </Button>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Vehículos ({sumPlacas.length ? `${sumPlacas.length} seleccionados` : "todos los de la ciudad/flota"})</Label>
                <div className="flex gap-2">
                  <button className="text-xs text-red-600 hover:underline" onClick={() => setSumPlacas([...sumPlacaOptions])}>Seleccionar todos</button>
                  <button className="text-xs text-neutral-500 hover:underline" onClick={() => setSumPlacas([])}>Limpiar</button>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto border border-neutral-200 rounded-md p-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
                {sumPlacaOptions.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-neutral-50 cursor-pointer">
                    <input type="checkbox" checked={sumPlacas.includes(p)} onChange={() => toggleSumPlaca(p)} className="accent-[#0033a0]" />
                    <span className="font-mono text-xs">{p}</span>
                  </label>
                ))}
                {sumPlacaOptions.length === 0 && <div className="text-xs text-neutral-400 p-2">Sin vehículos</div>}
              </div>
            </div>
          </Card>

          {sumData && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                <KPI icon={RouteIcon} label="Km recorridos" value={numberFmt(sumData.totales.km_recorridos)} color="text-blue-600" />
                <KPI icon={Gauge} label="Consumo prom." value={`${numberFmt(sumData.totales.consumo_promedio)} Km/gal`} color="text-emerald-600" />
                <KPI icon={Fuel} label="Galones" value={numberFmt(sumData.totales.galones)} color="text-amber-600" />
                <KPI icon={DollarSign} label="Combustible" value={money(sumData.totales.combustible)} color="text-red-600" />
                <KPI icon={Car} label="Vehículos" value={numberFmt(sumData.totales.vehiculos)} color="text-neutral-700" />
                <KPI icon={RouteIcon} label="Viajes" value={numberFmt(sumData.totales.rutas_count)} color="text-neutral-700" />
              </div>
              <Card className="border border-neutral-200 shadow-none overflow-hidden">
                <div className="px-5 py-3 border-b border-neutral-200 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-red-600" /><h3 className="font-semibold">Detalle por vehículo</h3>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow className="bg-neutral-50">
                      <TableHead>Placa</TableHead><TableHead>Vehículo</TableHead><TableHead>Ciudad</TableHead>
                      <TableHead className="text-right">Km</TableHead><TableHead className="text-right">Galones</TableHead>
                      <TableHead className="text-right">Consumo (Km/gal)</TableHead><TableHead className="text-right">Combustible</TableHead><TableHead className="text-right">Viajes</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {sumData.por_vehiculo.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-8 text-neutral-400">Sin rutas en el periodo</TableCell></TableRow>
                      ) : sumData.por_vehiculo.map((v) => (
                        <TableRow key={v.placa}>
                          <TableCell className="font-mono">{v.placa}</TableCell>
                          <TableCell className="text-sm">{v.marca} {v.modelo}</TableCell>
                          <TableCell>{v.ciudad || "—"}</TableCell>
                          <TableCell className="text-right font-mono">{numberFmt(v.km)}</TableCell>
                          <TableCell className="text-right font-mono">{numberFmt(v.galones)}</TableCell>
                          <TableCell className="text-right font-mono">{numberFmt(v.consumo_promedio)}</TableCell>
                          <TableCell className="text-right font-mono">{money(v.combustible)}</TableCell>
                          <TableCell className="text-right font-mono">{v.rutas}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {mode === "individual" && (!selected ? (
        <Card className="p-16 text-center border border-dashed border-neutral-300 shadow-none">
          <Car className="w-12 h-12 mx-auto text-neutral-300 mb-3" />
          <p className="text-neutral-500">Selecciona una placa para ver su historial completo</p>
        </Card>
      ) : loading || !data ? (
        <div className="p-8 text-neutral-500">Cargando historial…</div>
      ) : (
        <>
          {/* Ficha */}
          <Card className="p-6 border border-neutral-200 shadow-none">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <Badge className="bg-neutral-900 text-white font-mono text-base px-3 py-1">{data.vehiculo["Placa Vehiculo"]}</Badge>
                  <h2 className="text-xl font-bold">{data.vehiculo.Marca} {data.vehiculo.Modelo}</h2>
                  <Badge variant="secondary">{data.vehiculo.Tipo}</Badge>
                  <Badge className={data.vehiculo.Status === "Activo" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                    {data.vehiculo.Status}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 text-sm">
                  <div><span className="text-neutral-500">Año:</span> <span className="font-medium">{data.vehiculo["Año de fabricacion"] || "—"}</span></div>
                  <div><span className="text-neutral-500">Color:</span> <span className="font-medium">{data.vehiculo.Color || "—"}</span></div>
                  <div><span className="text-neutral-500">Empresa:</span> <span className="font-medium">{data.vehiculo.Empresa || "—"}</span></div>
                  <div><span className="text-neutral-500">Ciudad:</span> <span className="font-medium">{data.vehiculo.Ubicacion || "—"}</span></div>
                  <div><span className="text-neutral-500">Usuario:</span> <span className="font-medium">{data.vehiculo["Usuario asignado"] || "—"}</span></div>
                  <div><span className="text-neutral-500">Odóm. Actual:</span> <span className="font-mono">{numberFmt(data.vehiculo["Kms Odómetro Actual"])} Km</span></div>
                  <div><span className="text-neutral-500">Estado Mnto:</span> <span className="font-medium">{data.vehiculo["Estado Mantenimiento Preventivo"] || "—"}</span></div>
                  <div><span className="text-neutral-500">Estado:</span> <span className="font-medium">{data.vehiculo["Estado Vehiculo"] || "—"}</span></div>
                </div>
              </div>
            </div>
          </Card>

          {/* Totals */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI icon={DollarSign} label="Gasto Total" value={money(data.totales.gasto_total)} color="text-red-600" />
            <KPI icon={ShieldCheck} label="Seguros" value={money(data.totales.seguros)} color="text-blue-600" />
            <KPI icon={Wrench} label="Mantenimiento" value={money(data.totales.mantenimiento)} color="text-amber-600" />
            <KPI icon={Fuel} label="Combustible" value={money(data.totales.combustible)} color="text-emerald-600" />
            <KPI icon={FileText} label="Impuestos" value={money(data.totales.impuestos)} color="text-neutral-700" />
            <KPI icon={AlertTriangle} label="Multas" value={money(data.totales.multas)} color="text-red-600" />
            <KPI icon={RouteIcon} label="Km recorridos" value={`${numberFmt(data.totales.km_recorridos)}`} color="text-blue-600" />
            <KPI icon={RouteIcon} label="Total viajes" value={numberFmt(data.totales.rutas_count)} color="text-neutral-700" />
          </div>

          {/* Sections */}
          <Section title="Seguros" count={data.seguros.length} icon={ShieldCheck}>
            <Table>
              <TableHeader><TableRow className="bg-neutral-50">
                <TableHead>Inicio</TableHead><TableHead>Vencimiento</TableHead><TableHead>Aseguradora</TableHead><TableHead>Póliza</TableHead><TableHead className="text-right">Importe</TableHead><TableHead>Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.seguros.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell>{fmtDate(s["Fecha de inicio"])}</TableCell>
                    <TableCell>{fmtDate(s["Fecha de Vencimiento"])}</TableCell>
                    <TableCell>{s.Aseguradora || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{s["Poliza seguro"] || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{money(s["Importe Pagado ()"] || s["Importe Pagado ($)"])}</TableCell>
                    <TableCell>{s["Estado Poliza"] || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title="Mantenimientos" count={data.mantenimiento.length} icon={Wrench}>
            <Table>
              <TableHeader><TableRow className="bg-neutral-50">
                <TableHead>Nro</TableHead><TableHead>Entrada</TableHead><TableHead>Salida</TableHead><TableHead>Taller</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Costo</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.mantenimiento.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{m.Nro || "—"}</TableCell>
                    <TableCell>{fmtDate(m["Fecha Entrada"])}</TableCell>
                    <TableCell>{fmtDate(m["Fecha Salida"])}</TableCell>
                    <TableCell>{m.Taller || "—"}</TableCell>
                    <TableCell>{m.Tipo || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{money(m["Costo Total ($)"])}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title="Multas" count={data.multas.length} icon={AlertTriangle}>
            <Table>
              <TableHeader><TableRow className="bg-neutral-50">
                <TableHead>Fecha</TableHead><TableHead>Conductor</TableHead><TableHead>Infracción</TableHead><TableHead className="text-right">Multa</TableHead><TableHead className="text-right">Pagado</TableHead><TableHead>Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.multas.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell>{fmtDate(m.Fecha)}</TableCell>
                    <TableCell>{m.Conductor || "—"}</TableCell>
                    <TableCell>{m.Infracción || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{money(m["Importe multa ($)"])}</TableCell>
                    <TableCell className="text-right font-mono">{money(m["Importe pagado ($)"])}</TableCell>
                    <TableCell>{m["Estado Pago"] || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title="Rutas" count={data.rutas.length} icon={RouteIcon}>
            <Table>
              <TableHeader><TableRow className="bg-neutral-50">
                <TableHead>Salida</TableHead><TableHead>Llegada</TableHead><TableHead>Origen</TableHead><TableHead>Destino</TableHead><TableHead className="text-right">Km</TableHead><TableHead className="text-right">Combustible</TableHead><TableHead className="text-right">Gasto</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.rutas.slice(0, 50).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{fmtDate(r["Fecha de Salida"])}</TableCell>
                    <TableCell>{fmtDate(r["Fecha de Llegada"])}</TableCell>
                    <TableCell>{r.Origen || r.Ciudad || "—"}</TableCell>
                    <TableCell>{r.Destino || r.Ruta || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{numberFmt(Math.max((r["Kms Final (Odómetro)"] || 0) - (r["Kms Inicial (Odómetro)"] || 0), 0))}</TableCell>
                    <TableCell className="text-right font-mono">{money(r["Total Combustible ($)"])}</TableCell>
                    <TableCell className="text-right font-mono">{money(r["Gasto Total ($)"])}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.rutas.length > 50 && <div className="p-3 text-xs text-neutral-500 border-t border-neutral-200 bg-neutral-50">Mostrando 50 de {data.rutas.length} viajes. El PDF incluye hasta 60.</div>}
          </Section>
        </>
      ))}
    </div>
  );
}

const KPI = ({ icon: Icon, label, value, color }) => (
  <Card className="p-4 border border-neutral-200 shadow-none">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500">{label}</div>
        <div className="mt-1 text-2xl font-bold font-mono">{value}</div>
      </div>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
  </Card>
);

const Section = ({ title, count, icon: Icon, children }) => (
  <Card className="border border-neutral-200 shadow-none overflow-hidden">
    <div className="px-5 py-3 border-b border-neutral-200 flex items-center justify-between bg-white">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-neutral-500" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <Badge variant="secondary" className="font-mono">{count}</Badge>
    </div>
    <div className="overflow-x-auto">{children}</div>
  </Card>
);
