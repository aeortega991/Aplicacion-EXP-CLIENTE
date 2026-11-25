import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const RouteDialog = ({ item, cities, onClose, onSaved }) => {
  const [form, setForm] = useState({ ruta: "", ciudad: "", estado: "Activo" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (item) setForm({ ruta: item.ruta || "", ciudad: item.ciudad || "", estado: item.estado || "Activo" });
  }, [item]);

  const save = async (e) => {
    e.preventDefault();
    if (!form.ruta.trim() || !form.ciudad) { toast.error("Ruta y Ciudad son obligatorias"); return; }
    setSaving(true);
    try {
      if (item.id) await api.put(`/service-routes/${item.id}`, form);
      else await api.post("/service-routes", form);
      toast.success("Ruta guardada");
      onSaved();
    } catch (err) { toast.error(formatApiError(err)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)]" data-testid="route-dialog">
        <DialogHeader><DialogTitle>{item?.id ? `Editar ruta ${item.codigo}` : "Nueva ruta de servicio"}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>Ruta *</Label>
            <Input value={form.ruta} onChange={(e) => setForm((f) => ({ ...f, ruta: e.target.value }))} autoFocus data-testid="route-ruta-input" />
          </div>
          <div className="space-y-2">
            <Label>Ciudad *</Label>
            <Select value={form.ciudad || undefined} onValueChange={(v) => setForm((f) => ({ ...f, ciudad: v }))}>
              <SelectTrigger data-testid="route-ciudad-select"><SelectValue placeholder="Seleccionar ciudad" /></SelectTrigger>
              <SelectContent>{cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Estado</Label>
            <Select value={form.estado} onValueChange={(v) => setForm((f) => ({ ...f, estado: v }))}>
              <SelectTrigger data-testid="route-estado-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Activo">Activo</SelectItem>
                <SelectItem value="Inactivo">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-red-600 hover:bg-red-700 text-white" data-testid="route-submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
