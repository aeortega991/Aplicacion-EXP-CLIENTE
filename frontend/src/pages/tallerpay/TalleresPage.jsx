import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/SearchSelect";
import BulkUploadDialog from "@/components/BulkUploadDialog";
import { Plus, Pencil, Search, Power, RotateCcw, Tags, Store } from "lucide-react";
import { LINEAS, LineaBadges } from "./constants";

const EMPTY = { codigo_sap: "", nombre: "", ruc: "", ciudad: "", direccion: "", contacto: "", telefono: "", correo: "", lineas: ["blanca", "cafe"] };

const Stat = ({ label, value, tone = "text-neutral-900", testId }) => (
  <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 min-w-[120px]" data-testid={testId}>
    <div className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</div>
    <div className={`text-2xl font-bold ${tone}`}>{value}</div>
  </div>
);

function WorkshopDialog({ open, initial, cities, lineOptions, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm(initial ? { ...EMPTY, ...initial } : EMPTY); }, [open, initial]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const toggleLinea = (v, checked) => setForm((f) => ({ ...f, lineas: checked ? [...new Set([...f.lineas, v])] : f.lineas.filter((x) => x !== v) }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.codigo_sap.trim() || !form.nombre.trim()) return toast.error("Código SAP y nombre son obligatorios");
    if (!form.lineas.length) return toast.error("Seleccione al menos una línea");
    setSaving(true);
    try {
      const body = { codigo_sap: form.codigo_sap, nombre: form.nombre, ruc: form.ruc, ciudad: form.ciudad, direccion: form.direccion, contacto: form.contacto, telefono: form.telefono, correo: form.correo, lineas: form.lineas };
      if (initial?.id) await api.put(`/tallerpay/talleres/${initial.id}`, body);
      else await api.post("/tallerpay/talleres", body);
      toast.success(initial?.id ? "Taller actualizado" : "Taller creado");
      onSaved();
    } catch (err) { toast.error(formatApiError(err)); } finally { setSaving(false); }
  };

  const cityOptions = [{ value: "", label: "— Sin ciudad —" }, ...cities.map((c) => ({ value: c, label: c }))];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="workshop-dialog">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Editar taller" : "Nuevo taller tercerizado"}</DialogTitle>
          <DialogDescription>El código SAP identifica al taller de forma única.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Código SAP *</Label><Input value={form.codigo_sap} onChange={set("codigo_sap")} maxLength={30} data-testid="ws-codigo-sap" /></div>
          <div className="space-y-1.5"><Label>Nombre / razón social *</Label><Input value={form.nombre} onChange={set("nombre")} data-testid="ws-nombre" /></div>
          <div className="space-y-1.5"><Label>RUC / cédula</Label><Input value={form.ruc} onChange={set("ruc")} inputMode="numeric" maxLength={13} data-testid="ws-ruc" /></div>
          <div className="space-y-1.5"><Label>Ciudad</Label><SearchSelect value={form.ciudad} onChange={set("ciudad")} options={cityOptions} placeholder="Seleccionar ciudad" testId="ws-ciudad" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Dirección</Label><Input value={form.direccion} onChange={set("direccion")} data-testid="ws-direccion" /></div>
          <div className="space-y-1.5"><Label>Contacto</Label><Input value={form.contacto} onChange={set("contacto")} data-testid="ws-contacto" /></div>
          <div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.telefono} onChange={set("telefono")} data-testid="ws-telefono" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Correo</Label><Input type="email" value={form.correo} onChange={set("correo")} data-testid="ws-correo" /></div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Líneas que atiende *</Label>
            <div className="flex gap-6">
              {lineOptions.map((l) => (
                <label key={l.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={form.lineas.includes(l.value)} onCheckedChange={(c) => toggleLinea(l.value, !!c)} data-testid={`ws-linea-${l.value}`} /> {l.label}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-red-600 hover:bg-red-700 text-white" data-testid="ws-save">{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TalleresPage() {
  const { can } = useAuth();
  const canEdit = can("tp_talleres", "edit");
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], resumen: { total: 0, activos: 0, inactivos: 0 } });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("todos");
  const [cities, setCities] = useState([]);
  const [lineOptions, setLineOptions] = useState(LINEAS);
  const [edit, setEdit] = useState(null);
  const [toggle, setToggle] = useState(null);
  const [motivo, setMotivo] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.get("/tallerpay/talleres", { params: { q, estado } })
      .then((r) => setData(r.data)).catch((e) => toast.error(formatApiError(e))).finally(() => setLoading(false));
  }, [q, estado]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (canEdit) api.get("/cities").then((r) => setCities(r.data.cities || [])).catch(() => {}); }, [canEdit]);
  useEffect(() => { api.get("/tallerpay/catalogo/lineas").then((r) => setLineOptions(r.data.items.filter(l=>l.activo).map(l=>({value:l.codigo,label:l.nombre})))).catch(() => {}); }, []);

  const confirmToggle = async () => {
    try {
      await api.post(`/tallerpay/talleres/${toggle.id}/estado`, { activo: !toggle.activo, motivo });
      toast.success(toggle.activo ? "Taller desactivado" : "Taller reactivado");
      setToggle(null); setMotivo(""); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6" data-testid="tallerpay-talleres">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Pago a talleres</div>
          <h1 className="text-3xl font-bold tracking-tight">Talleres tercerizados</h1>
          <p className="text-sm text-neutral-500 mt-1">Prestadores de servicio técnico identificados por código SAP.</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <BulkUploadDialog title="Importar talleres" templateUrl="/tallerpay/talleres/template" importUrl="/tallerpay/talleres/import"
              templateName="plantilla_talleres_tercerizados.xlsx" onDone={load} testId="ws-import-button"
              description="Los códigos SAP nuevos se crean y los existentes se actualizan. Líneas: blanca, cafe (separadas por coma)." />
            <Button onClick={() => setEdit({})} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="ws-add-button"><Plus className="w-4 h-4" /> Nuevo taller</Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Stat label="Total" value={data.resumen.total} testId="ws-stat-total" />
        <Stat label="Activos" value={data.resumen.activos} tone="text-emerald-600" testId="ws-stat-activos" />
        <Stat label="Inactivos" value={data.resumen.inactivos} tone="text-neutral-400" testId="ws-stat-inactivos" />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código SAP, nombre, RUC, ciudad…" className="pl-9" data-testid="ws-search" />
        </div>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-44" data-testid="ws-estado-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="inactivos">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código SAP</TableHead><TableHead>Taller</TableHead><TableHead>RUC</TableHead><TableHead>Ciudad</TableHead>
              <TableHead>Contacto</TableHead><TableHead>Líneas</TableHead><TableHead className="text-center">Tarifas</TableHead>
              <TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((w) => (
              <TableRow key={w.id} className={w.activo ? "" : "opacity-60"} data-testid={`ws-row-${w.codigo_sap}`}>
                <TableCell className="font-mono font-semibold">{w.codigo_sap}</TableCell>
                <TableCell><div className="font-medium">{w.nombre}</div>{w.direccion && <div className="text-xs text-neutral-500">{w.direccion}</div>}</TableCell>
                <TableCell className="text-sm">{w.ruc || "—"}</TableCell>
                <TableCell className="text-sm">{w.ciudad || "—"}</TableCell>
                <TableCell className="text-sm">
                  <div>{w.contacto || "—"}</div>
                  <div className="text-xs text-neutral-500">{[w.telefono, w.correo].filter(Boolean).join(" · ")}</div>
                </TableCell>
                <TableCell><LineaBadges lineas={w.lineas} catalog={lineOptions} /></TableCell>
                <TableCell className="text-center">{w.tarifas}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${w.activo ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`} data-testid={`ws-estado-${w.codigo_sap}`}>{w.activo ? "Activo" : "Inactivo"}</span>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {can("tp_tarifarios") && (
                    <Button variant="ghost" size="sm" title="Ver tarifario" onClick={() => navigate(`/pago-talleres/tarifarios?taller=${w.id}`)} data-testid={`ws-tarifas-${w.codigo_sap}`}><Tags className="w-4 h-4" /></Button>
                  )}
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="sm" title="Editar" onClick={() => setEdit(w)} data-testid={`ws-edit-${w.codigo_sap}`}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" title={w.activo ? "Desactivar" : "Reactivar"} onClick={() => { setMotivo(""); setToggle(w); }} data-testid={`ws-toggle-${w.codigo_sap}`}>
                        {w.activo ? <Power className="w-4 h-4 text-red-600" /> : <RotateCcw className="w-4 h-4 text-emerald-600" />}
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!loading && data.items.length === 0 && (
              <TableRow><TableCell colSpan={9} className="py-12 text-center text-neutral-500" data-testid="ws-empty">
                <Store className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                {q || estado !== "todos" ? "No hay talleres con esos filtros." : "Aún no hay talleres registrados."}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <WorkshopDialog open={!!edit} initial={edit?.id ? edit : null} cities={cities} lineOptions={lineOptions} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />

      <Dialog open={!!toggle} onOpenChange={(o) => !o && setToggle(null)}>
        <DialogContent className="max-w-md" data-testid="ws-toggle-dialog">
          <DialogHeader>
            <DialogTitle>{toggle?.activo ? "Desactivar taller" : "Reactivar taller"}</DialogTitle>
            <DialogDescription>
              {toggle?.activo
                ? `${toggle?.codigo_sap} · ${toggle?.nombre} dejará de estar disponible para nuevas tarifas y liquidaciones. Su historial se conserva.`
                : `${toggle?.codigo_sap} · ${toggle?.nombre} volverá a estar disponible.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5"><Label>Motivo (opcional)</Label><Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} data-testid="ws-toggle-motivo" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToggle(null)}>Cancelar</Button>
            <Button onClick={confirmToggle} className={toggle?.activo ? "bg-red-600 hover:bg-red-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"} data-testid="ws-toggle-confirm">
              {toggle?.activo ? "Desactivar" : "Reactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
