import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { RegionDialog } from "./RegionDialog";

export default function RegionesPage() {
  const [data, setData] = useState({ regions: [], analysts: [], unmapped_cities: [], known_cities: [] });
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => {
    api.get("/ts/regions").then((r) => setData(r.data)).catch((e) => toast.error(formatApiError(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (g) => {
    if (!window.confirm(`¿Eliminar la región ${g.nombre}? Sus ciudades quedarán sin asignación automática.`)) return;
    try { await api.delete(`/ts/regions/${g.id}`); toast.success("Región eliminada"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const noAnalyst = data.regions.filter((g) => !g.analista);

  return (
    <div className="space-y-4" data-testid="ts-regiones">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Regiones y ciudades</h1>
          <p className="text-sm text-neutral-500">Cada ciudad pertenece a una región y cada región tiene un analista técnico responsable.</p>
        </div>
        <Button onClick={() => setEdit({})} className="gap-1.5 bg-[#0033A0] hover:bg-[#002a85]" data-testid="ts-region-new"><Plus className="w-4 h-4" /> Nueva región</Button>
      </div>
      {(noAnalyst.length > 0 || data.unmapped_cities.length > 0) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-1" data-testid="ts-region-warnings">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="w-4 h-4" /> Configuración incompleta</div>
          {noAnalyst.length > 0 && <div>Regiones sin analista: {noAnalyst.map((g) => g.nombre).join(", ")}</div>}
          {data.unmapped_cities.length > 0 && <div>Ciudades de técnicos sin región: {data.unmapped_cities.join(", ")}</div>}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.regions.map((g) => (
          <div key={g.id} className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3" data-testid={`ts-region-${g.nombre}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{g.nombre}</div>
                <div className="text-xs text-neutral-500">Analista: {g.analista?.name || <span className="text-amber-600">Sin analista</span>}</div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEdit(g)} data-testid={`ts-region-edit-${g.nombre}`}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(g)} data-testid={`ts-region-delete-${g.nombre}`}><Trash2 className="w-4 h-4 text-red-600" /></Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.ciudades.length === 0 && <span className="text-xs text-neutral-400">Sin ciudades</span>}
              {g.ciudades.map((c) => <span key={c} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{c}</span>)}
            </div>
          </div>
        ))}
      </div>
      <RegionDialog region={edit} analysts={data.analysts} knownCities={data.known_cities} unmapped={data.unmapped_cities}
        onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
    </div>
  );
}
