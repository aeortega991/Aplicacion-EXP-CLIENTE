import { useEffect, useMemo, useState } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Download, FileText, DollarSign, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { estadoBadge } from "./estados";
import ExpenseDetailDialog from "./ExpenseDetailDialog";

const fmtDate = (v) => { if (!v) return "—"; try { return new Date(v).toLocaleDateString("es-EC"); } catch { return String(v); } };

export default function GastosReportes() {
  const [rows, setRows] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fCiudad, setFCiudad] = useState("all");
  const [fEstado, setFEstado] = useState("all");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [exporting, setExporting] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/expenses").then((r) => setRows(r.data)).catch((e) => toast.error(formatApiError(e))).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    api.get("/expenses/meta").then((r) => setCities(r.data.cities || [])).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    let d = rows;
    if (fCiudad !== "all") d = d.filter((r) => (r.ciudad || "") === fCiudad);
    if (fEstado !== "all") d = d.filter((r) => r.estado === fEstado);
    if (fDesde) d = d.filter((r) => String(r.created_at || "").slice(0, 10) >= fDesde);
    if (fHasta) d = d.filter((r) => String(r.created_at || "").slice(0, 10) <= fHasta);
    return d;
  }, [rows, fCiudad, fEstado, fDesde, fHasta]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const monto = filtered.reduce((a, r) => a + Number(r.monto || 0), 0);
    const aprobados = filtered.filter((r) => r.estado === "aprobado");
    const montoAprob = aprobados.reduce((a, r) => a + Number(r.monto || 0), 0);
    const rechazados = filtered.filter((r) => r.estado === "rechazado").length;
    return { total, monto, aprobados: aprobados.length, montoAprob, rechazados };
  }, [filtered]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const params = {};
      if (fCiudad !== "all") params.ciudad = fCiudad;
      if (fDesde) params.desde = fDesde;
      if (fHasta) params.hasta = fHasta;
      const r = await api.get("/expenses/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte_gastos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Reporte Excel generado");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setExporting(false); }
  };

  const estadoOptions = [
    ["all", "Todos los estados"], ["pend_coordinador", "Pend. coordinador"], ["pend_presupuesto", "Pend. presupuesto"],
    ["pend_factura", "Pend. factura"], ["pend_aprob_coordinador", "Pend. aprob. coord."],
    ["pend_aprob_gerencia", "Pend. gerencia"], ["aprobado", "Aprobado"], ["rechazado", "Rechazado"],
  ];

  const clearFilters = () => { setFCiudad("all"); setFEstado("all"); setFDesde(""); setFHasta(""); };
  const hasFilters = fCiudad !== "all" || fEstado !== "all" || fDesde || fHasta;

  return (
    <div className="p-8" data-testid="gastos-reportes">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Gastos</div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-red-600" /> Reportes de gastos
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Filtra por ciudad y fecha todos los gastos ingresados.</p>
        </div>
        <Button onClick={exportExcel} disabled={exporting} variant="outline" className="gap-2" data-testid="reportes-export">
          <Download className="w-4 h-4" /> {exporting ? "Generando…" : "Exportar Excel"}
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-4 border border-neutral-200 shadow-none mb-5">
        <div className="grid md:grid-cols-5 gap-4 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Ciudad</Label>
            <Select value={fCiudad} onValueChange={setFCiudad}>
              <SelectTrigger data-testid="rep-ciudad"><SelectValue placeholder="Ciudad" /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="all">Todas las ciudades</SelectItem>
                {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estado</Label>
            <Select value={fEstado} onValueChange={setFEstado}>
              <SelectTrigger data-testid="rep-estado"><SelectValue /></SelectTrigger>
              <SelectContent>{estadoOptions.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Desde (ingreso)</Label>
            <Input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} data-testid="rep-desde" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasta (ingreso)</Label>
            <Input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} data-testid="rep-hasta" />
          </div>
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="rep-clear">Limpiar filtros</Button>}
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        <KPI icon={FileText} label="Solicitudes" value={kpis.total} color="text-neutral-700" />
        <KPI icon={DollarSign} label="Monto total" value={money(kpis.monto)} color="text-red-600" />
        <KPI icon={CheckCircle2} label="Aprobados" value={kpis.aprobados} color="text-emerald-600" />
        <KPI icon={DollarSign} label="Monto aprobado" value={money(kpis.montoAprob)} color="text-emerald-600" />
        <KPI icon={XCircle} label="Rechazados" value={kpis.rechazados} color="text-red-600" />
      </div>

      <Card className="border border-neutral-200 shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-neutral-50">
                <TableHead className="text-xs uppercase tracking-wider">ID</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Proveedor</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Cuenta</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Ciudad</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Solicitante</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Monto</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Estado</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Ingreso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-neutral-400">Cargando…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-neutral-400">Sin gastos para los filtros aplicados</TableCell></TableRow>
              ) : filtered.map((r) => {
                const b = estadoBadge(r.estado);
                return (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-neutral-50" onClick={() => { setDetailId(r.id); setDetailOpen(true); }} data-testid={`rep-row-${r.numero}`}>
                    <TableCell className="font-mono font-medium">{r.numero}</TableCell>
                    <TableCell>{r.proveedor}</TableCell>
                    <TableCell className="text-sm text-neutral-600">{r.cuenta_nombre}</TableCell>
                    <TableCell>{r.ciudad}</TableCell>
                    <TableCell className="text-sm">{r.solicitante_nombre}</TableCell>
                    <TableCell className="text-right font-mono">{money(r.monto)}</TableCell>
                    <TableCell><Badge variant="outline" className={b.cls}>{b.label}</Badge></TableCell>
                    <TableCell className="text-sm text-neutral-500">{fmtDate(r.created_at)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ExpenseDetailDialog expenseId={detailId} open={detailOpen} onOpenChange={setDetailOpen} onChanged={load} />
    </div>
  );
}

const KPI = ({ icon: Icon, label, value, color }) => (
  <Card className="p-4 border border-neutral-200 shadow-none">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500">{label}</div>
        <div className="mt-1 text-2xl font-bold font-mono">{value}</div>
      </div>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
  </Card>
);
