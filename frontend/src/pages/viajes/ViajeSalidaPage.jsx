import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/SearchSelect";
import { AlertTriangle, CheckCircle2, Navigation } from "lucide-react";
import { TripsTable } from "./TripsTable";

const today = () => new Date().toLocaleDateString("en-CA");
const empty = () => ({ fecha_salida: today(), placa: "", conductor_id: "", km_salida: "", ruta_id: "" });
const REQUIRED = [["fecha_salida", "Fecha de salida"], ["placa", "Vehículo"], ["conductor_id", "Conductor"], ["km_salida", "KM salida"], ["ruta_id", "Ruta"]];

export default function ViajeSalidaPage() {
  const { can } = useAuth();
  const canEdit = can("veh_rutas", "edit");
  const [form, setForm] = useState(empty);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [trips, setTrips] = useState([]);
  const [saving, setSaving] = useState(false);
  const [lastCode, setLastCode] = useState(null);

  const loadTrips = useCallback(() => {
    api.get("/viajes").then((r) => setTrips(r.data)).catch((e) => toast.error(formatApiError(e)));
  }, []);

  useEffect(() => {
    loadTrips();
    if (!canEdit) return;
    api.get("/modules/flota").then((r) => {
      const act = r.data.filter((v) => v["Placa Vehiculo"] && String(v.Status || "").toLowerCase() === "activo");
      setVehicles(act.map((v) => ({ value: v["Placa Vehiculo"], label: `${v["Placa Vehiculo"]} · ${[v.Marca, v.Modelo].filter(Boolean).join(" ")}` })).sort((a, b) => a.value.localeCompare(b.value)));
    }).catch(() => {});
    api.get("/modules/tecnicos").then((r) => setDrivers(r.data.map((t) => ({ value: t.id, label: `${t.nombre} · ${t.ciudad || "sin ciudad"}` })))).catch(() => {});
  }, [loadTrips, canEdit]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const pickDriver = async (id) => {
    setForm((f) => ({ ...f, conductor_id: id, ruta_id: "" }));
    setRouteInfo(null);
    try {
      const { data } = await api.get("/service-routes/for-conductor", { params: { conductor_id: id } });
      setRouteInfo(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const submit = async (e) => {
    e.preventDefault();
    const missing = REQUIRED.filter(([k]) => String(form[k] ?? "").trim() === "").map(([, l]) => l);
    if (missing.length) { toast.error(`Campos obligatorios: ${missing.join(", ")}`); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/viajes/salida", { ...form, km_salida: Number(form.km_salida) });
      setLastCode(data["Codigo Viaje"]);
      toast.success(`Viaje ${data["Codigo Viaje"]} registrado · En curso`, { duration: 8000 });
      setForm(empty());
      setRouteInfo(null);
      loadTrips();
    } catch (err) { toast.error(formatApiError(err)); } finally { setSaving(false); }
  };

  const routeOptions = (routeInfo?.routes || []).map((r) => ({ value: r.id, label: r.ruta }));

  return (
    <div className="p-4 sm:p-8 space-y-6" data-testid="viaje-salida-page">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Vehículos</div>
        <h1 className="text-3xl font-bold tracking-tight">Viaje salida</h1>
        <p className="text-sm text-neutral-500 mt-1">Registra el inicio del viaje. El retorno se completa luego en Viaje retorno.</p>
      </div>

      {canEdit && (
        <form onSubmit={submit} className="bg-white border border-neutral-200 rounded-md p-5 space-y-4" data-testid="salida-form">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Fecha de salida *</Label>
              <Input type="date" value={form.fecha_salida} onChange={(e) => set("fecha_salida")(e.target.value)} data-testid="salida-fecha" />
            </div>
            <div className="space-y-2">
              <Label>Vehículo (Placa) *</Label>
              <SearchSelect value={form.placa} onChange={set("placa")} options={vehicles} placeholder="Seleccionar vehículo" testId="salida-vehiculo" />
            </div>
            <div className="space-y-2">
              <Label>Conductor (Técnico) *</Label>
              <SearchSelect value={form.conductor_id} onChange={pickDriver} options={drivers} placeholder="Seleccionar conductor" testId="salida-conductor" />
            </div>
            <div className="space-y-2">
              <Label>KM salida (Odómetro) *</Label>
              <Input type="number" step="any" min="0" value={form.km_salida} onChange={(e) => set("km_salida")(e.target.value)} data-testid="salida-km" />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>Ruta * {routeInfo?.ciudad && <span className="text-xs text-neutral-400">· rutas activas de {routeInfo.ciudad}</span>}</Label>
              <SearchSelect value={form.ruta_id} onChange={set("ruta_id")} options={routeOptions} disabled={!form.conductor_id || !routeOptions.length}
                placeholder={form.conductor_id ? "Seleccionar ruta" : "Primero selecciona el conductor"} testId="salida-ruta" />
            </div>
          </div>
          {routeInfo?.message && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="salida-route-warning">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {routeInfo.message}
            </div>
          )}
          {lastCode && (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800" data-testid="salida-confirmation">
              <CheckCircle2 className="w-4 h-4" /> Último viaje registrado: <b className="font-mono">{lastCode}</b>
            </div>
          )}
          <Button type="submit" disabled={saving || !!routeInfo?.message} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="salida-submit">
            <Navigation className="w-4 h-4" /> {saving ? "Registrando…" : "Registrar salida"}
          </Button>
        </form>
      )}

      <TripsTable trips={trips} />
    </div>
  );
}
