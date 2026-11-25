import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, MapPinned, Search } from "lucide-react";
import { CatalogDialog } from "@/components/CatalogDialog";

const RegionCard = ({ g, onEdit, onDelete }) => (
  <div className="rounded-lg border border-neutral-200 bg-white p-4" data-testid={`region-card-${g.nombre}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="font-semibold tracking-tight">{g.nombre}</div>
      <div className="flex -mr-2 -mt-1">
        <Button variant="ghost" size="sm" onClick={onEdit} data-testid={`region-edit-${g.nombre}`}><Pencil className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" onClick={onDelete} data-testid={`region-delete-${g.nombre}`}><Trash2 className="w-4 h-4 text-red-600" /></Button>
      </div>
    </div>
    <div className="text-xs text-neutral-500 mt-1">{g.ciudades} ciudad(es) · {g.usuarios} usuario(s)</div>
    <div className="text-xs mt-1">Analista: {g.analista || <span className="text-amber-600">sin analista técnico</span>}</div>
  </div>
);

export default function CiudadesPage() {
  const [data, setData] = useState({ regions: [], cities: [] });
  const [edit, setEdit] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [q, setQ] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");

  const load = useCallback(() => {
    api.get("/catalog").then((r) => setData(r.data)).catch((e) => toast.error(formatApiError(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const cities = useMemo(() => data.cities.filter((c) =>
    (!q || c.nombre.includes(q.trim().toUpperCase())) &&
    (regionFilter === "all" || (regionFilter === "none" ? !c.region_id : c.region_id === regionFilter))
  ), [data.cities, q, regionFilter]);

  const assignRegion = async (c, regionId) => {
    try {
      await api.put(`/catalog/cities/${c.id}`, { nombre: c.nombre, region_id: regionId === "__none__" ? null : regionId });
      toast.success(`${c.nombre} actualizada`);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const doDelete = async () => {
    const { kind, id } = confirmDel;
    try {
      await api.delete(`/catalog/${kind === "city" ? "cities" : "regions"}/${id}`);
      toast.success("Eliminado");
      setConfirmDel(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); setConfirmDel(null); }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6" data-testid="ciudades-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Administración</div>
          <h1 className="text-3xl font-bold tracking-tight">Ciudades</h1>
          <p className="text-sm text-neutral-500 mt-1">Catálogo único de regiones y ciudades para toda la aplicación.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEdit({ kind: "region" })} className="gap-2" data-testid="add-region-button"><MapPinned className="w-4 h-4" /> Nueva región</Button>
          <Button onClick={() => setEdit({ kind: "city" })} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="add-city-button"><Plus className="w-4 h-4" /> Nueva ciudad</Button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Regiones</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.regions.map((g) => (
            <RegionCard key={g.id} g={g} onEdit={() => setEdit({ kind: "region", ...g })} onDelete={() => setConfirmDel({ kind: "region", id: g.id, nombre: g.nombre })} />
          ))}
          {data.regions.length === 0 && <div className="text-sm text-neutral-400">Aún no hay regiones.</div>}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Ciudades ({cities.length})</h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-neutral-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ciudad" className="pl-8 h-9" data-testid="city-search-input" />
            </div>
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="w-40 h-9" data-testid="city-region-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las regiones</SelectItem>
                <SelectItem value="none">Sin región</SelectItem>
                {data.regions.map((g) => <SelectItem key={g.id} value={g.id}>{g.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Card className="border border-neutral-200 shadow-none overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-neutral-50">
                <TableHead className="text-xs uppercase tracking-wider">Ciudad</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Región</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Usuarios</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cities.map((c) => (
                <TableRow key={c.id} data-testid="city-row">
                  <TableCell className="font-medium">{c.nombre}</TableCell>
                  <TableCell>
                    <Select value={c.region_id || "__none__"} onValueChange={(v) => assignRegion(c, v)}>
                      <SelectTrigger className={`h-8 w-36 ${c.region_id ? "" : "text-amber-600"}`} data-testid={`city-region-${c.nombre}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Sin región —</SelectItem>
                        {data.regions.map((g) => <SelectItem key={g.id} value={g.id}>{g.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{c.usuarios ? <Badge variant="secondary">{c.usuarios}</Badge> : <span className="text-neutral-400 text-sm">0</span>}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setEdit({ kind: "city", ...c })} data-testid={`city-edit-${c.nombre}`}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDel({ kind: "city", id: c.id, nombre: c.nombre })} data-testid={`city-delete-${c.nombre}`}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {cities.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-neutral-400 py-8">No hay ciudades</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </section>

      <CatalogDialog item={edit} regions={data.regions} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {confirmDel?.kind === "city" ? "ciudad" : "región"}?</AlertDialogTitle>
            <AlertDialogDescription>{confirmDel?.nombre} se eliminará del catálogo. Solo es posible si no está en uso.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-red-600 hover:bg-red-700" data-testid="catalog-confirm-delete">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
