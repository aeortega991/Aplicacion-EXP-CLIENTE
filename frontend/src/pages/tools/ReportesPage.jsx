import { useEffect, useState } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileBarChart, History } from "lucide-react";
import { toast } from "sonner";

function ReportContent({ mode }) {
  const [ciudad, setCiudad] = useState("__all__");
  const [technicianId, setTechnicianId] = useState("__all__");
  const [cities, setCities] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.get("/cities").then((r) => setCities(r.data.cities || []));
    api.get("/tools/technicians").then((r) => setTechnicians(r.data));
  }, []);

  useEffect(() => {
    const params = {};
    if (ciudad !== "__all__") params.ciudad = ciudad;
    if (mode === "current" && technicianId !== "__all__") params.technician_id = technicianId;
    const path = mode === "current" ? "/tools/reports/current" : "/tools/reports/history";
    api.get(path, { params }).then((r) => setRows(r.data)).catch((e) => toast.error(formatApiError(e)));
  }, [ciudad, technicianId, mode]);

  const totalValor = rows.reduce((s, r) => s + Number(r.tool_valor || 0), 0);

  return (
    <div className="space-y-6">
      <Card className="p-4 border border-neutral-200 shadow-none">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1 min-w-[200px]">
            <Label className="text-xs">Ciudad</Label>
            <Select value={ciudad} onValueChange={setCiudad}>
              <SelectTrigger data-testid={`${mode}-ciudad-select`}><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="__all__">— Todas —</SelectItem>
                {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {mode === "current" && (
            <div className="space-y-1 min-w-[240px]">
              <Label className="text-xs">Técnico</Label>
              <Select value={technicianId} onValueChange={setTechnicianId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__all__">— Todos —</SelectItem>
                  {technicians.map((t) => <SelectItem key={t.id} value={t.id}>{t.codigo} — {t.nombre} {t.apellido}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="ml-auto text-right">
            <div className="text-xs uppercase tracking-widest text-neutral-500">Registros</div>
            <div className="text-2xl font-bold font-mono">{rows.length}</div>
            {mode === "current" && <div className="text-xs text-neutral-500 mt-1 font-mono">Valor total: {money(totalValor)}</div>}
          </div>
        </div>
      </Card>

      <Card className="border border-neutral-200 shadow-none overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
              <TableHead className="text-xs uppercase tracking-wider">ID</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Herramienta</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Técnico</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Ciudad</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">F. Asignación</TableHead>
              {mode === "history" && <TableHead className="text-xs uppercase tracking-wider">F. Devolución</TableHead>}
              <TableHead className="text-right text-xs uppercase tracking-wider">Valor</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={mode === "history" ? 8 : 7} className="text-center py-10 text-neutral-500">Sin registros</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.tool_code}</TableCell>
                <TableCell>{r.tool_marca} {r.tool_modelo}</TableCell>
                <TableCell className="font-medium">{r.technician_nombre} {r.technician_apellido}</TableCell>
                <TableCell>{r.ciudad || "—"}</TableCell>
                <TableCell className="font-mono">{r.fecha_asignacion}</TableCell>
                {mode === "history" && <TableCell className="font-mono">{r.fecha_devolucion || "—"}</TableCell>}
                <TableCell className="text-right font-mono">{money(r.tool_valor)}</TableCell>
                <TableCell>
                  <Badge className={r.estado === "Vigente" ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-800"}>{r.estado}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

export function ReporteActual() {
  return (
    <div className="p-8 space-y-6" data-testid="tools-reporte-actual">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Reportes</div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><FileBarChart className="w-7 h-7 text-red-600" /> Reporte Actual</h1>
        <p className="text-sm text-neutral-500 mt-1">Herramientas actualmente asignadas. Filtra por ciudad o por técnico.</p>
      </div>
      <ReportContent mode="current" />
    </div>
  );
}

export function ReporteHistorico() {
  return (
    <div className="p-8 space-y-6" data-testid="tools-reporte-historico">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Reportes</div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><History className="w-7 h-7 text-red-600" /> Reporte Histórico</h1>
        <p className="text-sm text-neutral-500 mt-1">Todas las asignaciones (vigentes y devueltas) con fechas y estado.</p>
      </div>
      <ReportContent mode="history" />
    </div>
  );
}
