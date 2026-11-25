import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

export const RegionDialog = ({ region, analysts, knownCities, unmapped, onClose, onSaved }) => {
  const [form, setForm] = useState({ nombre: "", ciudades: [], analista_id: "" });
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (region) setForm({ nombre: region.nombre || "", ciudades: region.ciudades || [], analista_id: region.analista_id || "" });
  }, [region]);

  const addCity = (c) => {
    const v = (c || "").trim().toUpperCase();
    if (v && !form.ciudades.includes(v)) setForm((f) => ({ ...f, ciudades: [...f.ciudades, v].sort() }));
    setCity("");
  };

  const save = async () => {
    setSaving(true);
    const body = { ...form, analista_id: form.analista_id || null };
    try {
      if (region.id) await api.put(`/ts/regions/${region.id}`, body);
      else await api.post("/ts/regions", body);
      toast.success("Región guardada");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!region} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto" data-testid="ts-region-dialog">
        <DialogHeader><DialogTitle>{region?.id ? "Editar región" : "Nueva región"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} data-testid="ts-region-nombre" />
          </div>
          <div className="space-y-1.5">
            <Label>Analista técnico responsable</Label>
            <Select value={form.analista_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, analista_id: v === "none" ? "" : v }))}>
              <SelectTrigger data-testid="ts-region-analista"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin analista</SelectItem>
                {analysts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ciudades</Label>
            <div className="flex flex-wrap gap-1.5">
              {form.ciudades.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                  {c}<button onClick={() => setForm((f) => ({ ...f, ciudades: f.ciudades.filter((x) => x !== c) }))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input list="ts-known-cities" value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCity(city)} placeholder="Agregar ciudad" data-testid="ts-region-city-input" />
              <datalist id="ts-known-cities">{knownCities.map((c) => <option key={c} value={c} />)}</datalist>
              <Button variant="outline" size="icon" onClick={() => addCity(city)} data-testid="ts-region-city-add"><Plus className="w-4 h-4" /></Button>
            </div>
            {unmapped.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {unmapped.filter((c) => !form.ciudades.includes(c)).map((c) => (
                  <button key={c} onClick={() => addCity(c)} className="rounded-full border border-dashed border-amber-400 text-amber-700 px-2 py-0.5 text-xs hover:bg-amber-50">+ {c}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-[#0033A0] hover:bg-[#002a85]" data-testid="ts-region-save">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
