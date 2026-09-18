import { useEffect, useState } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ClipboardCheck, RotateCcw } from "lucide-react";

export default function AsignacionesPage() {
  const [tools, setTools] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [current, setCurrent] = useState([]);
  const [toolId, setToolId] = useState("");
  const [techId, setTechId] = useState("");

  const load = async () => {
    const [t, tech, cur] = await Promise.all([
      api.get("/tools/tools"),
      api.get("/tools/technicians"),
      api.get("/tools/reports/current"),
    ]);
    setTools(t.data);
    setTechnicians(tech.data);
    setCurrent(cur.data);
  };
  useEffect(() => { load(); }, []);

  const selected = tools.find((t) => t.id === toolId);

  const submit = async (e) => {
    e.preventDefault();
    if (!toolId || !techId) { toast.error("Selecciona herramienta y técnico"); return; }
    try {
      await api.post("/tools/assignments", { tool_id: toolId, technician_id: techId });
      toast.success("Herramienta asignada");
      setToolId(""); setTechId("");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const returnAssignment = async (id) => {
    try {
      await api.patch(`/tools/assignments/${id}/return`);
      toast.success("Devolución registrada");
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const availableTools = tools.filter((t) => t.estado === "Activa" && !current.some((c) => c.tool_id === t.id));

  return (
    <div className="p-8 space-y-6" data-testid="tools-asignaciones">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Operación</div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><ClipboardCheck className="w-7 h-7 text-red-600" /> Asignar Herramienta</h1>
        <p className="text-sm text-neutral-500 mt-1">Selecciona una herramienta activa y disponible, y el técnico responsable.</p>
      </div>

      <Card className="p-6 border border-neutral-200 shadow-none">
        <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
          <div className="space-y-2">
            <Label>ID de Herramienta *</Label>
            <Select value={toolId} onValueChange={setToolId}>
              <SelectTrigger data-testid="assign-tool-select"><SelectValue placeholder={`${availableTools.length} disponibles…`} /></SelectTrigger>
              <SelectContent className="max-h-64">
                {availableTools.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.tool_id} — {t.marca} {t.modelo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Técnico *</Label>
            <Select value={techId} onValueChange={setTechId}>
              <SelectTrigger data-testid="assign-tech-select"><SelectValue placeholder="Seleccionar técnico…" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {technicians.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.codigo} — {t.nombre} {t.apellido} · {t.ciudad || "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white h-10" data-testid="assign-submit-btn">Asignar</Button>
        </form>

        {selected && (
          <div className="mt-6 pt-6 border-t border-neutral-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><div className="text-xs text-neutral-500 uppercase">ID</div><div className="font-mono font-semibold">{selected.tool_id}</div></div>
            <div><div className="text-xs text-neutral-500 uppercase">Marca</div><div className="font-semibold">{selected.marca}</div></div>
            <div><div className="text-xs text-neutral-500 uppercase">Modelo</div><div>{selected.modelo || "—"}</div></div>
            <div><div className="text-xs text-neutral-500 uppercase">Serie</div><div className="font-mono text-xs">{selected.serie || "—"}</div></div>
            <div><div className="text-xs text-neutral-500 uppercase">Descripción</div><div className="text-sm">{selected.descripcion || "—"}</div></div>
            <div><div className="text-xs text-neutral-500 uppercase">F. Compra</div><div>{selected.fecha_compra || "—"}</div></div>
            <div><div className="text-xs text-neutral-500 uppercase">Valor</div><div className="font-mono">{money(selected.valor)}</div></div>
            <div><div className="text-xs text-neutral-500 uppercase">Estado</div><Badge className="bg-emerald-100 text-emerald-800">{selected.estado}</Badge></div>
          </div>
        )}
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-3">Asignaciones vigentes ({current.length})</h2>
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
                  <TableCell><span className="font-mono">{a.tool_code}</span> · {a.tool_marca} {a.tool_modelo}</TableCell>
                  <TableCell className="font-medium">{a.technician_nombre} {a.technician_apellido}</TableCell>
                  <TableCell>{a.ciudad || "—"}</TableCell>
                  <TableCell className="font-mono">{a.fecha_asignacion}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => returnAssignment(a.id)} className="gap-1"><RotateCcw className="w-3 h-3" /> Devolver</Button>
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
