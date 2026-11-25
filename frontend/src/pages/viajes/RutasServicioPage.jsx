import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Plus, Search } from "lucide-react";
import BulkUploadDialog from "@/components/BulkUploadDialog";
import { RouteDialog } from "./RouteDialog";

export default function RutasServicioPage() {
  const { can } = useAuth();
  const canEdit = can("veh_rutas_servicio", "edit");
  const [routes, setRoutes] = useState([]);
  const [cities, setCities] = useState([]);
  const [ciudad, setCiudad] = useState("all");
  const [estado, setEstado] = useState("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);

  const load = useCallback(() => {
    const params = { ...(ciudad !== "all" && { ciudad }), ...(estado !== "all" && { estado }) };
    api.get("/service-routes", { params }).then((r) => setRoutes(r.data)).catch((e) => toast.error(formatApiError(e)));
  }, [ciudad, estado]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/cities").then((r) => setCities(r.data.cities || [])).catch(() => {}); }, []);

  const rows = useMemo(() => routes.filter((r) => !q.trim() || `${r.codigo} ${r.ruta}`.toLowerCase().includes(q.trim().toLowerCase())), [routes, q]);

  const toggle = async (r) => {
    try {
      await api.put(`/service-routes/${r.id}`, { ruta: r.ruta, ciudad: r.ciudad, estado: r.estado === "Activo" ? "Inactivo" : "Activo" });
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6" data-testid="rutas-servicio-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Vehículos</div>
          <h1 className="text-3xl font-bold tracking-tight">Rutas de servicio</h1>
          <p className="text-sm text-neutral-500 mt-1">Catálogo de rutas por ciudad usado en Viaje salida.</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <BulkUploadDialog templateUrl="/service-routes/template" importUrl="/service-routes/import" title="Importar rutas de servicio"
              templateName="plantilla_rutas_servicio.xlsx" onDone={load} />
            <Button onClick={() => setEdit({})} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="add-route-button"><Plus className="w-4 h-4" /> Nueva ruta</Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-neutral-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ruta" className="pl-8 h-9" data-testid="routes-search" />
        </div>
        <Select value={ciudad} onValueChange={setCiudad}>
          <SelectTrigger className="w-48 h-9" data-testid="routes-ciudad-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las ciudades</SelectItem>
            {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-40 h-9" data-testid="routes-estado-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="Activo">Activo</SelectItem>
            <SelectItem value="Inactivo">Inactivo</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-neutral-500 self-center ml-auto" data-testid="routes-count">{rows.length} ruta(s)</span>
      </div>

      <div className="bg-white border border-neutral-200 rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
              {["ID", "Ruta", "Ciudad", "Estado", ""].map((h) => <TableHead key={h} className="text-xs uppercase tracking-wider">{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid="route-row">
                <TableCell className="font-mono text-xs font-semibold">{r.codigo}</TableCell>
                <TableCell className="font-medium">{r.ruta}</TableCell>
                <TableCell>{r.ciudad}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {canEdit && <Switch checked={r.estado === "Activo"} onCheckedChange={() => toggle(r)} data-testid={`route-toggle-${r.codigo}`} />}
                    <span className={`text-xs font-medium ${r.estado === "Activo" ? "text-green-700" : "text-neutral-400"}`}>{r.estado}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {canEdit && <Button variant="ghost" size="sm" onClick={() => setEdit(r)} data-testid={`route-edit-${r.codigo}`}><Pencil className="w-4 h-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-neutral-400 py-8">No hay rutas</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <RouteDialog item={edit} cities={cities} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
    </div>
  );
}
