import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { MODULES } from "@/config/modules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CornerDownLeft, Lock, Search } from "lucide-react";
import { TripBadge } from "./TripsTable";
import { ReturnField } from "./ReturnField";

const SALIDA_KEYS = ["Fecha de Salida", "Placa Vehiculo", "Conductor", "Kms Inicial (Odómetro)"];
const RET_FIELDS = MODULES.find((m) => m.key === "rutas").fields.filter((f) => !SALIDA_KEYS.includes(f.key));

const RO = ({ label, children, testId }) => (
  <div className="min-w-0">
    <div className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</div>
    <div className="text-sm font-medium break-words" data-testid={testId}>{children || "—"}</div>
  </div>
);

export default function ViajeRetornoPage() {
  const [trips, setTrips] = useState([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get("/viajes/pendientes").then((r) => setTrips(r.data)).catch((e) => toast.error(formatApiError(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return trips.filter((t) => !s || [t["Codigo Viaje"], t["Placa Vehiculo"], t.Conductor, t.Ruta].some((v) => String(v || "").toLowerCase().includes(s)));
  }, [trips, q]);

  const merged = { ...(sel || {}), ...form };
  const pick = (t) => { setSel(t); setForm({}); };

  const submit = async (e) => {
    e.preventDefault();
    const missing = RET_FIELDS.filter((f) => f.required && !f.derived && String(form[f.key] ?? "").trim() === "").map((f) => f.label);
    if (missing.length) { toast.error(`Campos obligatorios: ${missing.join(", ")}`); return; }
    if (form["Fecha de Llegada"] < String(sel["Fecha de Salida"]).slice(0, 10)) { toast.error("La fecha de llegada no puede ser anterior a la fecha de salida"); return; }
    if (Number(form["Kms Final (Odómetro)"]) < Number(sel["Kms Inicial (Odómetro)"] || 0)) { toast.error("El KM de regreso debe ser mayor o igual al KM de salida"); return; }
    setSaving(true);
    try {
      await api.put(`/viajes/${sel.id}/retorno`, { data: form });
      toast.success(`Viaje ${sel["Codigo Viaje"]} finalizado`);
      setSel(null); setForm({});
      load();
    } catch (err) { toast.error(formatApiError(err)); load(); } finally { setSaving(false); }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6" data-testid="viaje-retorno-page">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Vehículos</div>
        <h1 className="text-3xl font-bold tracking-tight">Viaje retorno</h1>
        <p className="text-sm text-neutral-500 mt-1">Selecciona uno de tus viajes en curso para registrar su retorno.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-neutral-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código, vehículo, conductor o ruta" className="pl-8 h-9" data-testid="retorno-search" />
          </div>
          <div className="space-y-2 max-h-[65vh] overflow-y-auto" data-testid="retorno-list">
            {filtered.length === 0 && <div className="text-sm text-neutral-400 text-center py-8 border border-dashed rounded-md">No tienes viajes pendientes de retorno</div>}
            {filtered.map((t) => (
              <button key={t.id} type="button" onClick={() => pick(t)} data-testid={`retorno-trip-${t["Codigo Viaje"]}`}
                className={`w-full text-left rounded-md border p-3 transition-colors ${sel?.id === t.id ? "border-red-600 bg-red-50" : "border-neutral-200 bg-white hover:border-neutral-400"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold">{t["Codigo Viaje"]}</span>
                  <TripBadge estado={t["Estado Viaje"]} />
                </div>
                <div className="text-sm font-medium mt-1">{t["Placa Vehiculo"]} · {t.Conductor}</div>
                <div className="text-xs text-neutral-500 truncate">{t.Ruta} · salida {String(t["Fecha de Salida"]).slice(0, 10)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          {!sel ? (
            <div className="h-full min-h-[240px] flex items-center justify-center text-sm text-neutral-400 border border-dashed rounded-md bg-white">Selecciona un viaje de la lista</div>
          ) : (
            <form onSubmit={submit} className="bg-white border border-neutral-200 rounded-md p-5 space-y-5" data-testid="retorno-form">
              <div className="rounded-md bg-neutral-50 border border-neutral-200 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 mb-3"><Lock className="w-3.5 h-3.5" /> Datos de salida</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <RO label="Código" testId="retorno-ro-codigo">{sel["Codigo Viaje"]}</RO>
                  <RO label="Fecha de salida" testId="retorno-ro-fecha">{String(sel["Fecha de Salida"]).slice(0, 10)}</RO>
                  <RO label="Vehículo" testId="retorno-ro-vehiculo">{sel["Placa Vehiculo"]}</RO>
                  <RO label="Conductor" testId="retorno-ro-conductor">{sel.Conductor}</RO>
                  <RO label="KM salida" testId="retorno-ro-km">{sel["Kms Inicial (Odómetro)"]}</RO>
                  <RO label="Ruta" testId="retorno-ro-ruta">{sel.Ruta}</RO>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {RET_FIELDS.map((f) => (
                  <ReturnField key={f.key} f={f} value={form[f.key]} merged={merged} onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} />
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setSel(null)}>Cancelar</Button>
                <Button type="submit" disabled={saving} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="retorno-submit">
                  <CornerDownLeft className="w-4 h-4" /> {saving ? "Guardando…" : "Registrar retorno"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
