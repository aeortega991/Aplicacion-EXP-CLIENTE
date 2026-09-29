import { useEffect, useMemo, useState } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Filter, Download } from "lucide-react";
import { toast } from "sonner";
import { estadoBadge } from "./estados";
import ExpenseDetailDialog from "./ExpenseDetailDialog";

const emptyForm = { cuenta_codigo: "", proveedor: "", fecha: new Date().toISOString().slice(0, 10), monto: "", necesita_presupuesto: false, url_cotizacion: "", descripcion: "", ciudad: "" };

export default function SolicitudesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [cities, setCities] = useState([]);
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState("all");
  const [fCiudad, setFCiudad] = useState("all");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [detailId, setDetailId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const canCreate = user?.role === "lider" || user?.role === "admin";

  const load = () => api.get("/expenses").then((r) => setRows(r.data)).catch((e) => toast.error(formatApiError(e)));
  useEffect(() => {
    load();
    api.get("/expenses/meta").then((r) => { setAccounts(r.data.accounts || []); setCities(r.data.cities || []); });
  }, []);

  const filtered = useMemo(() => {
    let d = rows;
    if (fEstado !== "all") d = d.filter((r) => r.estado === fEstado);
    if (fCiudad !== "all") d = d.filter((r) => (r.ciudad || "") === fCiudad);
    if (fDesde) d = d.filter((r) => String(r.created_at || "").slice(0, 10) >= fDesde);
    if (fHasta) d = d.filter((r) => String(r.created_at || "").slice(0, 10) <= fHasta);
    if (q) { const s = q.toLowerCase(); d = d.filter((r) => [r.numero, r.proveedor, r.cuenta_nombre, r.solicitante_nombre, r.ciudad].some((v) => String(v || "").toLowerCase().includes(s))); }
    return d;
  }, [rows, q, fEstado, fCiudad, fDesde, fHasta]);

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
      a.download = `gastos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel generado");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setExporting(false); }
  };

  const openDetail = (id) => { setDetailId(id); setDetailOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.cuenta_codigo || !form.proveedor || !form.monto || !form.fecha) { toast.error("Completa los campos obligatorios"); return; }
    setSaving(true);
    try {
      const payload = { ...form, monto: Number(form.monto) };
      if (user?.role !== "admin") delete payload.ciudad;
      await api.post("/expenses", payload);
      toast.success("Solicitud creada");
      setOpen(false); setForm(emptyForm); load();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  const estadoOptions = [
    ["all", "Todos"], ["pend_coordinador", "Pend. coordinador"], ["pend_presupuesto", "Pend. presupuesto"],
    ["pend_factura", "Pend. factura"], ["pend_aprob_coordinador", "Pend. aprob. coord."],
    ["pend_aprob_gerencia", "Pend. gerencia"], ["aprobado", "Aprobado"], ["rechazado", "Rechazado"],
  ];

  return (
    <div className="p-8" data-testid="gastos-solicitudes">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Gastos</div>
          <h1 className="text-3xl font-bold tracking-tight">Solicitudes de gasto</h1>
          <p className="text-sm text-neutral-500 mt-1">{filtered.length} de {rows.length} solicitudes</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportExcel} disabled={exporting} variant="outline" className="gap-2" data-testid="btn-export-excel">
            <Download className="w-4 h-4" /> {exporting ? "Generando…" : "Excel"}
          </Button>
          {canCreate && (
            <Button onClick={() => { setForm(emptyForm); setOpen(true); }} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="btn-nueva-solicitud">
              <Plus className="w-4 h-4" /> Nueva solicitud
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10 w-64" data-testid="solic-search" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-neutral-400" />
          <Select value={fEstado} onValueChange={setFEstado}>
            <SelectTrigger className="w-52" data-testid="solic-estado-filter"><SelectValue /></SelectTrigger>
            <SelectContent>{estadoOptions.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Select value={fCiudad} onValueChange={setFCiudad}>
          <SelectTrigger className="w-44" data-testid="solic-ciudad-filter"><SelectValue placeholder="Ciudad" /></SelectTrigger>
          <SelectContent className="max-h-64">
            <SelectItem value="all">Todas las ciudades</SelectItem>
            {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-500">Creación:</span>
          <Input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} className="w-36" data-testid="solic-desde" />
          <span className="text-neutral-400">–</span>
          <Input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} className="w-36" data-testid="solic-hasta" />
        </div>
        {(fCiudad !== "all" || fDesde || fHasta || fEstado !== "all" || q) && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setFEstado("all"); setFCiudad("all"); setFDesde(""); setFHasta(""); }}>Limpiar</Button>
        )}
      </div>

      <Card className="border border-neutral-200 shadow-none overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
              <TableHead className="text-xs uppercase tracking-wider">N°</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Proveedor</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Cuenta</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Ciudad</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Monto</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Estado</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-neutral-400">Sin solicitudes</TableCell></TableRow>
            ) : filtered.map((r) => {
              const b = estadoBadge(r.estado);
              return (
                <TableRow key={r.id} className="cursor-pointer hover:bg-neutral-50" onClick={() => openDetail(r.id)} data-testid={`solic-row-${r.numero}`}>
                  <TableCell className="font-mono font-medium">{r.numero}</TableCell>
                  <TableCell>{r.proveedor}</TableCell>
                  <TableCell className="text-sm text-neutral-600">{r.cuenta_nombre}</TableCell>
                  <TableCell>{r.ciudad}</TableCell>
                  <TableCell className="text-right font-mono">{money(r.monto)}</TableCell>
                  <TableCell><Badge variant="outline" className={b.cls}>{b.label}</Badge></TableCell>
                  <TableCell className="text-sm text-neutral-500">{r.fecha}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Nueva solicitud */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva solicitud de gasto</DialogTitle>
            <DialogDescription>Registra el gasto y la cuenta contable afectada.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>Cuenta contable *</Label>
              <Select value={form.cuenta_codigo} onValueChange={(v) => setForm((s) => ({ ...s, cuenta_codigo: v }))}>
                <SelectTrigger data-testid="form-cuenta"><SelectValue placeholder="Seleccionar cuenta…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {accounts.map((a) => <SelectItem key={a.codigo} value={a.codigo}>{a.nombre} ({a.codigo})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Proveedor *</Label><Input value={form.proveedor} onChange={(e) => setForm((s) => ({ ...s, proveedor: e.target.value }))} data-testid="form-proveedor" /></div>
            <div className="space-y-1"><Label>Fecha *</Label><Input type="date" value={form.fecha} onChange={(e) => setForm((s) => ({ ...s, fecha: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Monto (USD) *</Label><Input type="number" step="0.01" value={form.monto} onChange={(e) => setForm((s) => ({ ...s, monto: e.target.value }))} data-testid="form-monto" /></div>
            {user?.role === "admin" && (
              <div className="space-y-1">
                <Label>Ciudad</Label>
                <Select value={form.ciudad || "__none__"} onValueChange={(v) => setForm((s) => ({ ...s, ciudad: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Ciudad…" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="__none__">— Mi ciudad —</SelectItem>
                    {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2 space-y-1"><Label>URL cotización</Label><Input value={form.url_cotizacion} onChange={(e) => setForm((s) => ({ ...s, url_cotizacion: e.target.value }))} placeholder="https://…" data-testid="form-url-cot" /></div>
            <div className="col-span-2 space-y-1"><Label>Descripción / necesidad</Label><Textarea value={form.descripcion} onChange={(e) => setForm((s) => ({ ...s, descripcion: e.target.value }))} /></div>
            <div className="col-span-2 flex items-center justify-between rounded-md border border-neutral-200 p-3">
              <div>
                <Label className="cursor-pointer">Requiere solicitud de presupuesto</Label>
                <p className="text-xs text-neutral-500">Si se activa, pasa por el tesorero antes de la factura.</p>
              </div>
              <Switch checked={form.necesita_presupuesto} onCheckedChange={(v) => setForm((s) => ({ ...s, necesita_presupuesto: v }))} data-testid="form-presupuesto-switch" />
            </div>
            <DialogFooter className="col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="bg-red-600 hover:bg-red-700 text-white" data-testid="form-submit">Crear solicitud</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ExpenseDetailDialog expenseId={detailId} open={detailOpen} onOpenChange={setDetailOpen} onChanged={load} />
    </div>
  );
}
