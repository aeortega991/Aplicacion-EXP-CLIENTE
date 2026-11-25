import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// item: { kind: "region" | "city", id?, nombre, region_id? }
export const CatalogDialog = ({ item, regions, onClose, onSaved }) => {
  const [nombre, setNombre] = useState("");
  const [regionId, setRegionId] = useState("");
  const [saving, setSaving] = useState(false);
  const isCity = item?.kind === "city";

  useEffect(() => {
    setNombre(item?.nombre || "");
    setRegionId(item?.region_id || "");
  }, [item]);

  const save = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    const base = isCity ? "/catalog/cities" : "/catalog/regions";
    const body = isCity ? { nombre, region_id: regionId || null } : { nombre };
    try {
      if (item.id) await api.put(`${base}/${item.id}`, body);
      else await api.post(base, body);
      toast.success(isCity ? "Ciudad guardada" : "Región guardada");
      onSaved();
    } catch (err) { toast.error(formatApiError(err)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)]" data-testid="catalog-dialog">
        <DialogHeader>
          <DialogTitle>{item?.id ? "Editar" : "Nueva"} {isCity ? "ciudad" : "región"}</DialogTitle>
          <DialogDescription>
            {isCity ? "La ciudad queda disponible en toda la aplicación (usuarios, gastos, vehículos, herramientas y tickets)." : "Agrupa ciudades. Se usa en gastos (coordinadores) y en la asignación de analistas de Ticket servicio."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus data-testid="catalog-nombre-input" />
          </div>
          {isCity && (
            <div className="space-y-2">
              <Label>Región</Label>
              <Select value={regionId || "__none__"} onValueChange={(v) => setRegionId(v === "__none__" ? "" : v)}>
                <SelectTrigger data-testid="catalog-region-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sin región —</SelectItem>
                  {regions.map((g) => <SelectItem key={g.id} value={g.id}>{g.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-red-600 hover:bg-red-700 text-white" data-testid="catalog-submit-btn">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
