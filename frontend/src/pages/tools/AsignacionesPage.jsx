import { useEffect, useMemo, useState } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ClipboardCheck, RotateCcw, Mail, Download, User, Warehouse } from "lucide-react";

export default function AsignacionesPage() {
  const [tools, setTools] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [current, setCurrent] = useState([]);
  const [destType, setDestType] = useState("technician");
  const [techId, setTechId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [selectedTools, setSelectedTools] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [t, tech, wh, cur] = await Promise.all([
      api.get("/tools/tools"),
      api.get("/tools/technicians"),
      api.get("/tools/warehouses"),
      api.get("/tools/reports/current"),
    ]);
    setTools(t.data);
    setTechnicians(tech.data);
    setWarehouses(wh.data);
    setCurrent(cur.data);
  };
  useEffect(() => { load(); }, []);

  const tech = technicians.find((t) => t.id === techId);
  const warehouse = warehouses.find((w) => w.id === warehouseId);
  const assignedToTechIds = new Set(current.map((c) => c.tool_id));
  const availableTools = useMemo(
    () => tools.filter((t) => t.estado === "Activa" && !assignedToTechIds.has(t.id)),
    [tools, current]
  );

  const toggleTool = (id) => {
    setSelectedTools((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  };
  const toggleAll = () => {
    if (selectedTools.length === availableTools.length) setSelectedTools([]);
    else setSelectedTools(availableTools.map((t) => t.id));
  };

  const selectedValue = tools
    .filter((t) => selectedTools.includes(t.id))
    .reduce((s, t) => s + Number(t.valor || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (destType === "technician" && !techId) { toast.error("Selecciona un técnico"); return; }
    if (destType === "warehouse" && !warehouseId) { toast.error("Selecciona una bodega"); return; }
    if (selectedTools.length === 0) { toast.error("Selecciona al menos una herramienta"); return; }
    setSubmitting(true);
    try {
      const payload = {
        destination_type: destType,
        tool_ids: selectedTools,
        technician_id: destType === "technician" ? techId : null,
        warehouse_id: destType === "warehouse" ? warehouseId : null,
      };
      const { data } = await api.post("/tools/assignments/batch", payload);
      const pdf = await api.get(`/tools/assignments/batch/${data.batch_id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([pdf.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `acta_${data.batch_id.slice(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      const enviados = data.emails_enviados.length;
      const omitidos = data.emails_omitidos.length;
      const destLabel = destType === "technician" ? "técnico" : "bodega";
      toast.success(`${data.total_herramientas} herramientas asignadas a ${destLabel} · PDF descargado · ${enviados} correo(s) enviado(s)${omitidos ? ` · ${omitidos} omitido(s)` : ""}`);
      setTechId(""); setWarehouseId(""); setSelectedTools([]);
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setSubmitting(false); }
  };

  const returnAssignment = async (id) => {
    try {
      await api.patch(`/tools/assignments/${id}/return`);
      toast.success("Devolución registrada");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const downloadPdfFor = async (batch_id) => {
    if (!batch_id) return;
    try {
      const pdf = await api.get(`/tools/assignments/batch/${batch_id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([pdf.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `acta_${batch_id.slice(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("PDF no disponible"); }
  };

  return (
    <div className="p-8 space-y-6" data-testid="tools-asignaciones">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Operación</div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="w-7 h-7 text-red-600" /> Asignar Herramientas
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Selecciona el destino (técnico o bodega interna) y una o varias herramientas. Al confirmar se genera un acta PDF y se envía por correo.
        </p>
      </div>

      <Card className="p-6 border border-neutral-200 shadow-none">
        <form onSubmit={submit} className="space-y-5">
          {/* Destination toggle */}
          <div>
            <Label className="mb-2 block">Destino</Label>
            <div className="inline-flex rounded-md border border-neutral-200 overflow-hidden">
              <button
                type="button"
                onClick={() => { setDestType("technician"); setWarehouseId(""); }}
                className={`flex items-center gap-2 px-4 py-2 text-sm ${destType === "technician" ? "bg-red-600 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}
                data-testid="dest-tech-btn"
              >
                <User className="w-4 h-4" /> Técnico
              </button>
              <button
                type="button"
                onClick={() => { setDestType("warehouse"); setTechId(""); }}
                className={`flex items-center gap-2 px-4 py-2 text-sm ${destType === "warehouse" ? "bg-red-600 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}
                data-testid="dest-wh-btn"
              >
                <Warehouse className="w-4 h-4" /> Bodega interna
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
            <div className="lg:col-span-2 space-y-2">
              {destType === "technician" ? (
                <>
                  <Label>Técnico *</Label>
                  <Select value={techId} onValueChange={setTechId}>
                    <SelectTrigger data-testid="assign-tech-select"><SelectValue placeholder="Seleccionar técnico…" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {technicians.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.codigo} — {t.nombre} {t.apellido} · {t.ciudad || "—"} {t.email ? `· ${t.email}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {tech && (
                    <div className="text-xs text-neutral-600 mt-2 flex flex-wrap gap-4">
                      {tech.cedula && <span><b>Cédula:</b> <span className="font-mono">{tech.cedula}</span></span>}
                      {tech.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {tech.email}</span>}
                      {!tech.email && <span className="text-amber-700">⚠ Sin email, no recibirá el acta</span>}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Label>Bodega interna *</Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger data-testid="assign-wh-select"><SelectValue placeholder="Seleccionar bodega interna…" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.nombre} · {w.ciudad}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {warehouse && (
                    <div className="text-xs text-neutral-600 mt-2 flex flex-wrap gap-4">
                      <span><b>Ciudad:</b> {warehouse.ciudad}</span>
                      {warehouse.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {warehouse.email}</span>}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest text-neutral-500">Seleccionadas</div>
              <div className="text-3xl font-bold font-mono">{selectedTools.length}</div>
              <div className="text-xs text-neutral-500 font-mono">Valor: {money(selectedValue)}</div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Herramientas disponibles ({availableTools.length})</Label>
              <button type="button" onClick={toggleAll} className="text-xs text-red-600 hover:text-red-700 font-medium">
                {selectedTools.length === availableTools.length && availableTools.length > 0 ? "Deseleccionar todo" : "Seleccionar todo"}
              </button>
            </div>
            <div className="border border-neutral-200 rounded-md max-h-72 overflow-y-auto">
              {availableTools.length === 0 ? (
                <div className="p-8 text-center text-sm text-neutral-500">No hay herramientas disponibles</div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {availableTools.map((t) => (
                    <label key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 cursor-pointer" data-testid={`tool-check-${t.tool_id}`}>
                      <Checkbox checked={selectedTools.includes(t.id)} onCheckedChange={() => toggleTool(t.id)} />
                      <span className="font-mono text-sm w-20 shrink-0">{t.tool_id}</span>
                      <span className="text-sm flex-1"><b>{t.marca}</b> {t.modelo || ""} · <span className="text-neutral-500">{t.serie || "sin serie"}</span></span>
                      <span className="font-mono text-sm">{money(t.valor)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" disabled={submitting} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="assign-batch-btn">
              <ClipboardCheck className="w-4 h-4" />
              {submitting ? "Procesando…" : `Asignar ${selectedTools.length || ""} y enviar acta`}
            </Button>
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
