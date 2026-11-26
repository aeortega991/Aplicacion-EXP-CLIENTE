import { useEffect, useMemo, useState } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ClipboardCheck, RotateCcw, Mail, Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const norm = (v) => String(v || "").trim().toUpperCase();

const saveBlob = (data, filename) => {
  const url = window.URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export default function AsignacionesPage() {
  const { can } = useAuth();
  const [technicians, setTechnicians] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [cities, setCities] = useState([]);
  const [current, setCurrent] = useState([]);
  const [ciudad, setCiudad] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [whTools, setWhTools] = useState([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [search, setSearch] = useState("");
  const [techId, setTechId] = useState("");
  const [selectedTools, setSelectedTools] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [tech, wh, cur, ci] = await Promise.all([
      api.get("/tools/technicians"),
      api.get("/tools/warehouses"),
      api.get("/tools/reports/current"),
      api.get("/cities"),
    ]);
    setTechnicians(tech.data);
    setWarehouses(wh.data);
    setCurrent(cur.data);
    setCities(ci.data.cities || []);
  };
  useEffect(() => { load(); }, []);

  const loadWhTools = async (id) => {
    if (!id) { setWhTools([]); return; }
    setLoadingTools(true);
    try {
      const { data } = await api.get(`/tools/warehouses/${id}/tools`);
      setWhTools(data.filter((t) => t.estado === "Activa"));
    } catch (err) { toast.error(formatApiError(err)); setWhTools([]); }
    finally { setLoadingTools(false); }
  };

  // Paso 1 → 2 y 4: la ciudad filtra bodegas y técnicos activos
  const cityWarehouses = useMemo(() => warehouses.filter((w) => !w.es_central && ciudad && norm(w.ciudad) === norm(ciudad)), [warehouses, ciudad]);
  const cityTechs = useMemo(() => technicians.filter((t) => t.activo !== false && ciudad && norm(t.ciudad) === norm(ciudad)), [technicians, ciudad]);
  const tech = cityTechs.find((t) => t.id === techId);
  const warehouse = cityWarehouses.find((w) => w.id === warehouseId);

  const onCiudad = (v) => { setCiudad(v); setWarehouseId(""); setWhTools([]); setSelectedTools([]); setTechId(""); setSearch(""); };
  const onWarehouse = (v) => { setWarehouseId(v); setSelectedTools([]); setSearch(""); loadWhTools(v); };

  const visibleTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return whTools;
    return whTools.filter((t) => [t.tool_code, t.marca, t.modelo, t.serie].join(" ").toLowerCase().includes(q));
  }, [whTools, search]);

  const toggleTool = (id) => {
    setSelectedTools((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };
  const allVisibleSelected = visibleTools.length > 0 && visibleTools.every((t) => selectedTools.includes(t.tool_id));
  const toggleAll = () => {
    const ids = visibleTools.map((t) => t.tool_id);
    if (allVisibleSelected) setSelectedTools((s) => s.filter((x) => !ids.includes(x)));
    else setSelectedTools((s) => [...new Set([...s, ...ids])]);
  };

  const selectedValue = whTools.filter((t) => selectedTools.includes(t.tool_id)).reduce((s, t) => s + Number(t.valor || 0), 0);
  const ready = ciudad && warehouseId && techId && selectedTools.length > 0;

  const downloadPdfFor = async (batch_id, name) => {
    if (!batch_id) return;
    try {
      const pdf = await api.get(`/tools/assignments/batch/${batch_id}/pdf`, { responseType: "blob" });
      saveBlob(pdf.data, `${name || `acta_${batch_id.slice(0, 8)}`}.pdf`);
      return true;
    } catch { toast.error("No se pudo descargar el acta. Puedes reintentar desde la tabla de asignaciones."); return false; }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!ciudad) { toast.error("Selecciona la ciudad"); return; }
    if (!warehouseId) { toast.error("Selecciona la bodega de origen"); return; }
    if (selectedTools.length === 0) { toast.error("Selecciona al menos una herramienta"); return; }
    if (!techId) { toast.error("Selecciona un técnico"); return; }
    if (norm(tech?.ciudad) !== norm(warehouse?.ciudad)) { toast.error("El técnico y la bodega deben ser de la misma ciudad"); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post("/tools/assignments/batch", {
        destination_type: "technician", technician_id: techId, source_warehouse_id: warehouseId, tool_ids: selectedTools,
      });
      await downloadPdfFor(data.batch_id, data.codigo);
      const enviados = data.emails_enviados.length;
      const omitidos = data.emails_omitidos.length;
      toast.success(`Asignación ${data.codigo}: ${data.total_herramientas} herramientas · ${enviados} correo(s)${omitidos ? ` · ${omitidos} omitido(s)` : ""}`);
      setSelectedTools([]); setTechId("");
      loadWhTools(warehouseId);
      load();
    } catch (err) {
      toast.error(formatApiError(err));
      loadWhTools(warehouseId);
    } finally { setSubmitting(false); }
  };

  const returnAssignment = async (id) => {
    try {
      await api.patch(`/tools/assignments/${id}/return`);
      toast.success("Devolución registrada");
      load();
      if (warehouseId) loadWhTools(warehouseId);
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <div className="p-8 space-y-6" data-testid="tools-asignaciones">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Operación</div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="w-7 h-7 text-red-600" /> Asignar Herramientas
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Elige la ciudad, la bodega de origen, las herramientas disponibles y el técnico de esa ciudad. Al confirmar se genera una única acta PDF y se envía por correo.
        </p>
      </div>

      <Card className="p-6 border border-neutral-200 shadow-none">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>1. Ciudad *</Label>
              <Select value={ciudad} onValueChange={onCiudad}>
                <SelectTrigger data-testid="asig-ciudad-filter"><SelectValue placeholder="Seleccionar ciudad…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>2. Bodega de origen *</Label>
              <Select value={warehouseId} onValueChange={onWarehouse} disabled={!ciudad}>
                <SelectTrigger data-testid="asig-wh-select"><SelectValue placeholder={!ciudad ? "Primero elige la ciudad" : cityWarehouses.length === 0 ? "Sin bodegas en esta ciudad" : "Seleccionar bodega…"} /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {cityWarehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>4. Técnico * {ciudad && <span className="text-xs text-neutral-500 font-normal">({cityTechs.length} en {ciudad})</span>}</Label>
              <Select value={techId} onValueChange={setTechId} disabled={!ciudad}>
                <SelectTrigger data-testid="assign-tech-select"><SelectValue placeholder={!ciudad ? "Primero elige la ciudad" : cityTechs.length === 0 ? "Sin técnicos activos en esta ciudad" : "Seleccionar técnico…"} /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {cityTechs.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.codigo} — {t.nombre} {t.apellido}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tech && (
                <div className="text-xs text-neutral-600 flex flex-wrap gap-3">
                  {tech.cedula && <span><b>Cédula:</b> <span className="font-mono">{tech.cedula}</span></span>}
                  {tech.email ? <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {tech.email}</span> : <span className="text-amber-700">⚠ Sin email, no recibirá el acta</span>}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <Label>3. Herramientas disponibles {warehouse ? `en ${warehouse.nombre}` : ""} ({whTools.length})</Label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ID, marca, serie…" className="pl-8 h-9 w-60" disabled={!warehouseId} data-testid="asig-tool-search" />
                </div>
                <button type="button" onClick={toggleAll} disabled={!visibleTools.length} className="text-xs text-red-600 hover:text-red-700 font-medium disabled:text-neutral-300" data-testid="asig-select-all">
                  {allVisibleSelected ? "Deseleccionar todo" : "Seleccionar todo"}
                </button>
              </div>
            </div>
            <div className="border border-neutral-200 rounded-md max-h-72 overflow-y-auto">
              {!warehouseId ? (
                <div className="p-8 text-center text-sm text-neutral-500">Selecciona la ciudad y la bodega de origen para ver sus herramientas</div>
              ) : loadingTools ? (
                <div className="p-8 text-center text-sm text-neutral-500">Cargando inventario…</div>
              ) : visibleTools.length === 0 ? (
                <div className="p-8 text-center text-sm text-neutral-500">{whTools.length ? "Ninguna herramienta coincide con la búsqueda" : "No hay herramientas disponibles en esta bodega"}</div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {visibleTools.map((t) => (
                    <label key={t.tool_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 cursor-pointer" data-testid={`tool-check-${t.tool_code}`}>
                      <Checkbox checked={selectedTools.includes(t.tool_id)} onCheckedChange={() => toggleTool(t.tool_id)} />
                      <span className="font-mono text-sm w-20 shrink-0">{t.tool_code}</span>
                      <span className="text-sm flex-1"><b>{t.marca}</b> {t.modelo || ""} · <span className="text-neutral-500">{t.serie || "sin serie"}</span></span>
                      <span className="font-mono text-sm">{money(t.valor)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-6">
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest text-neutral-500">Seleccionadas</div>
              <div className="text-2xl font-bold font-mono" data-testid="asig-selected-count">{selectedTools.length}</div>
              <div className="text-xs text-neutral-500 font-mono">Valor: {money(selectedValue)}</div>
            </div>
            {can("her_asignaciones", "edit") && (
            <Button type="submit" disabled={submitting || !ready} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="assign-batch-btn">
              <ClipboardCheck className="w-4 h-4" />
              {submitting ? "Procesando…" : `5. Asignar ${selectedTools.length || ""} y generar acta`}
            </Button>
            )}
          </div>
        </form>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-3">Asignaciones vigentes a técnicos ({current.length})</h2>
        <Card className="border border-neutral-200 shadow-none overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-neutral-50">
                <TableHead className="text-xs uppercase tracking-wider">Herramienta</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Técnico</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Ciudad</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">F. Asignación</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-neutral-500">Sin asignaciones vigentes</TableCell></TableRow>
              ) : current.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><span className="font-mono">{a.tool_code}</span> · {a.tool_marca} {a.tool_modelo || ""}</TableCell>
                  <TableCell className="font-medium">{a.technician_nombre} {a.technician_apellido}</TableCell>
                  <TableCell>{a.ciudad || "—"}</TableCell>
                  <TableCell className="font-mono">{a.fecha_asignacion}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {a.batch_id && (
                        <Button variant="ghost" size="sm" onClick={() => downloadPdfFor(a.batch_id)} title="Descargar acta">
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => returnAssignment(a.id)} className="gap-1"><RotateCcw className="w-3 h-3" /> Devolver</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
