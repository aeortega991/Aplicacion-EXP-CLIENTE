import { useEffect, useMemo, useState } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserRound, Download, History, Mail } from "lucide-react";
import { toast } from "sonner";

export default function HistorialTecnicoPage() {
  const [technicians, setTechnicians] = useState([]);
  const [techId, setTechId] = useState("");
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("todas"); // todas | vigentes | devueltas

  useEffect(() => {
    api.get("/tools/technicians").then((r) => setTechnicians(r.data)).catch((e) => toast.error(formatApiError(e)));
  }, []);

  useEffect(() => {
    if (!techId) { setData(null); return; }
    api.get(`/tools/technicians/${techId}/history`)
      .then((r) => setData(r.data))
      .catch((e) => toast.error(formatApiError(e)));
  }, [techId]);

  const tech = data?.technician;
  const rows = useMemo(() => {
    const list = data?.assignments || [];
    if (filter === "vigentes") return list.filter((a) => a.estado === "Vigente");
    if (filter === "devueltas") return list.filter((a) => a.estado !== "Vigente");
    return list;
  }, [data, filter]);

  const downloadPdf = async () => {
    if (!techId) return;
    try {
      const pdf = await api.get(`/tools/technicians/${techId}/history/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([pdf.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `historial_${tech?.codigo || "tecnico"}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("PDF no disponible"); }
  };

  return (
    <div className="p-8 space-y-6" data-testid="tools-historial-tec">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Reportes</div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <History className="w-7 h-7 text-red-600" /> Historial por Técnico
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Selecciona un técnico para ver todas las herramientas que ha tenido asignadas y devueltas. Puedes exportar el historial completo a PDF.
        </p>
      </div>

      <Card className="p-4 border border-neutral-200 shadow-none">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1 min-w-[280px]">
            <Label className="text-xs">Técnico</Label>
            <Select value={techId} onValueChange={setTechId}>
              <SelectTrigger data-testid="ht-tech-select"><SelectValue placeholder="Seleccionar técnico…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {technicians.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.codigo} — {t.nombre} {t.apellido} · {t.ciudad || "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 min-w-[180px]">
            <Label className="text-xs">Filtrar</Label>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="vigentes">Solo vigentes</SelectItem>
                <SelectItem value="devueltas">Solo devueltas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto">
            <Button onClick={downloadPdf} disabled={!techId} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="ht-pdf-btn">
              <Download className="w-4 h-4" /> Descargar PDF
            </Button>
          </div>
        </div>
      </Card>

      {tech && (
        <Card className="p-6 border border-neutral-200 shadow-none">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-md bg-neutral-100 flex items-center justify-center">
              <UserRound className="w-7 h-7 text-neutral-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">{tech.nombre} {tech.apellido}</h2>
                <Badge variant="secondary" className="font-mono">{tech.codigo}</Badge>
                {tech.ciudad && <Badge className="bg-neutral-900 text-white">{tech.ciudad}</Badge>}
              </div>
              <div className="text-sm text-neutral-600 mt-1 flex flex-wrap gap-4">
                {tech.cedula && <span><b>Cédula:</b> <span className="font-mono">{tech.cedula}</span></span>}
                {tech.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {tech.email}</span>}
              </div>
            </div>
          </div>
          {data?.stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              <div className="border border-neutral-200 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Total</div>
                <div className="text-2xl font-bold font-mono mt-0.5">{data.stats.total}</div>
              </div>
              <div className="border border-neutral-200 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Vigentes</div>
                <div className="text-2xl font-bold font-mono mt-0.5 text-emerald-700">{data.stats.activas}</div>
              </div>
              <div className="border border-neutral-200 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Devueltas</div>
                <div className="text-2xl font-bold font-mono mt-0.5 text-neutral-700">{data.stats.devueltas}</div>
              </div>
              <div className="border border-neutral-200 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Valor total</div>
                <div className="text-2xl font-bold font-mono mt-0.5">{money(data.stats.valor_total)}</div>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="border border-neutral-200 shadow-none overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
              <TableHead className="text-xs uppercase tracking-wider">F. Asignación</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">F. Devolución</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">ID</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Marca / Modelo</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Serie</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Valor</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!tech ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-neutral-500">Selecciona un técnico para ver su historial</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-neutral-500">Sin registros</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} data-testid={`ht-row-${r.tool_code}`}>
                <TableCell className="font-mono text-xs">{r.fecha_asignacion || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.fecha_devolucion || "—"}</TableCell>
                <TableCell className="font-mono">{r.tool_code}</TableCell>
                <TableCell><b>{r.tool_marca}</b> {r.tool_modelo || ""}</TableCell>
                <TableCell className="font-mono text-xs">{r.tool_serie || "—"}</TableCell>
                <TableCell className="text-right font-mono">{money(r.tool_valor)}</TableCell>
                <TableCell><Badge className={r.estado === "Vigente" ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-800"}>{r.estado}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
