import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const LABELS = { users: "usuarios", flota: "vehículos", impuestos: "impuestos", tool_warehouses: "bodegas", tool_technicians: "técnicos", service_routes: "rutas de servicio" };

export const MergeCityDialog = ({ city, cities, onClose, onDone }) => {
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setTarget(""), [city]);

  const merge = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/catalog/cities/${city.id}/merge`, { target_id: target });
      const moved = Object.entries(data.moved || {}).map(([k, n]) => `${n} ${LABELS[k] || k}`).join(", ");
      toast.success(`${data.from} unida a ${data.to}${moved ? `: ${moved}` : ""}`);
      onDone();
    } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!city} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)]" data-testid="merge-city-dialog">
        <DialogHeader>
          <DialogTitle>Unir {city?.nombre}</DialogTitle>
          <DialogDescription>Sus usuarios, vehículos, bodegas, técnicos, impuestos y rutas de servicio pasan a la ciudad elegida y {city?.nombre} se elimina del catálogo.</DialogDescription>
        </DialogHeader>
        <Select value={target || undefined} onValueChange={setTarget}>
          <SelectTrigger data-testid="merge-target-select"><SelectValue placeholder="Ciudad que se conserva" /></SelectTrigger>
          <SelectContent>{cities.filter((c) => c.id !== city?.id).map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={merge} disabled={!target || saving} className="bg-red-600 hover:bg-red-700 text-white" data-testid="merge-confirm">Unir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
