import { useEffect, useState, useMemo } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Search, FlaskConical, Ban, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import BulkUploadDialog from "@/components/BulkUploadDialog";

const empty = { marca: "", modelo: "", serie: "", descripcion: "", fecha_compra: "", valor: "" };

export default function HerramientasPage() {
  const { user, can } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [q, setQ] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulkConfirm, setBulkConfirm] = useState(null); // {action: 'deactivate'|'reactivate'}

  const load = () => api.get("/tools/tools").then((r) => setRows(r.data)).catch((e) => toast.error(formatApiError(e)));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => String(v || "").toLowerCase().includes(s)));
  }, [rows, q]);

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (r) => {
    setEditing(r);
    setForm({
      marca: r.marca || "", modelo: r.modelo || "", serie: r.serie || "",
      descripcion: r.descripcion || "", fecha_compra: r.fecha_compra || "", valor: r.valor || "",
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = { ...form, valor: Number(form.valor || 0) };
    try {
      if (editing) {
        await api.patch(`/tools/tools/${editing.id}`, payload);
        toast.success("Herramienta actualizada");
      } else {
        await api.post("/tools/tools", payload);
        toast.success("Herramienta creada", { description: "Ingresada a la Bodega Central" });
      }
      setOpen(false);
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const seedTest = async () => {
    if (!window.confirm("Se agregarán 20 herramientas y 5 técnicos por ciudad con valores aleatorios. ¿Continuar?")) return;
    setSeeding(true);
    try {
      const { data } = await api.post("/tools/seed-test-data");
      toast.success(`✓ ${data.tools_creadas} herramientas · ${data.tecnicos_creados} técnicos · ${data.bodegas_totales} bodegas`);
      load();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSeeding(false); }
  };

  const toggleRow = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleAllFiltered = () => {
    const ids = filtered.map((r) => r.id);
    const allChecked = ids.every((id) => selected.includes(id));
    if (allChecked) setSelected((s) => s.filter((x) => !ids.includes(x)));
    else setSelected((s) => Array.from(new Set([...s, ...ids])));
  };

  const selectedRows = useMemo(() => rows.filter((r) => selected.includes(r.id)), [rows, selected]);
  const canBulkDeactivate = can("her_bajas", "edit") && selectedRows.length > 0 && selectedRows.every((r) => r.estado === "Activa");
  const canBulkReactivate = can("her_bajas", "edit") && selectedRows.length > 0 && selectedRows.every((r) => r.estado === "Inactiva");

  const runBulk = async () => {
    if (!bulkConfirm) return;
    try {
      const { data } = await api.post("/tools/tools/bulk-deactivate", { tool_ids: selected, action: bulkConfirm.action });
      const label = bulkConfirm.action === "deactivate" ? "dadas de baja" : "reactivadas";
      const extra = (data.assignments_cerradas > 0 ? ` · ${data.assignments_cerradas} asignaciones cerradas` : "")
        + (data.enviadas_a_central > 0 ? ` · ${data.enviadas_a_central} ingresadas a Bodega Central` : "");
      toast.success(`✓ ${data.modified} herramientas ${label}${extra}`);
      setSelected([]);
      setBulkConfirm(null);
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <div className="p-8" data-testid="tools-inventario">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Inventario</div>
          <h1 className="text-3xl font-bold tracking-tight">Herramientas</h1>
          <p className="text-sm text-neutral-500 mt-1">{rows.length} {rows.length === 1 ? "herramienta" : "herramientas"} · {rows.filter((r) => r.estado === "Activa").length} activas</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10 w-64" />
          </div>
          {user?.role === "admin" && (
            <Button onClick={seedTest} disabled={seeding} variant="outline" className="gap-2" data-testid="seed-test-btn">
              <FlaskConical className="w-4 h-4" /> {seeding ? "Generando…" : "Datos de prueba"}
            </Button>
          )}
          {user?.role === "admin" && (
            <BulkUploadDialog
              templateUrl="/tools/tools/template"
              importUrl="/tools/tools/bulk-import"
              title="Carga masiva de herramientas"
              templateName="plantilla_herramientas.xlsx"
              onDone={load}
            />
          )}
          {can("her_inventario", "edit") && (
            <Button onClick={openCreate} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="add-tool-btn">
              <Plus className="w-4 h-4" /> Agregar
            </Button>
          )}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-neutral-900 text-white rounded-md px-4 py-2.5" data-testid="bulk-bar">
          <span className="text-sm font-medium">{selected.length} seleccionada{selected.length !== 1 ? "s" : ""}</span>
          <span className="text-neutral-400 text-xs">·</span>
          <button onClick={() => setSelected([])} className="text-xs text-neutral-400 hover:text-white transition-colors">Limpiar</button>
          <div className="ml-auto flex items-center gap-2">
            {canBulkDeactivate && (
              <Button size="sm" variant="destructive" onClick={() => setBulkConfirm({ action: "deactivate" })} className="gap-1.5" data-testid="bulk-deactivate-btn">
                <Ban className="w-3.5 h-3.5" /> Dar de baja
              </Button>
            )}
            {canBulkReactivate && (
              <Button size="sm" onClick={() => setBulkConfirm({ action: "reactivate" })} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="bulk-reactivate-btn">
                <CheckCircle2 className="w-3.5 h-3.5" /> Reactivar
              </Button>
            )}
            {!canBulkDeactivate && !canBulkReactivate && (
              <span className="text-xs text-neutral-300">La selección mezcla estados; homogeniza tu selección para acción en lote</span>
            )}
          </div>
        </div>
      )}

      <Card className="border border-neutral-200 shadow-none overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
              <TableHead className="w-10">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every((r) => selected.includes(r.id))}
                  onCheckedChange={toggleAllFiltered}
                  data-testid="bulk-toggle-all"
                />
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wider">ID</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Marca</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Modelo</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Serie</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Descripción</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">F. Compra</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Valor</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Estado</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id} data-testid="tool-row" className={selected.includes(r.id) ? "bg-red-50/50" : ""}>
                <TableCell>
                  <Checkbox checked={selected.includes(r.id)} onCheckedChange={() => toggleRow(r.id)} data-testid={`bulk-row-${r.tool_id}`} />
                </TableCell>
                <TableCell className="font-mono">{r.tool_id}</TableCell>
                <TableCell className="font-medium">{r.marca || "—"}</TableCell>
                <TableCell>{r.modelo || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.serie || "—"}</TableCell>
                <TableCell className="text-sm text-neutral-600 max-w-xs truncate">{r.descripcion || "—"}</TableCell>
                <TableCell>{r.fecha_compra || "—"}</TableCell>
                <TableCell className="text-right font-mono">{money(r.valor)}</TableCell>
                <TableCell>
                  <Badge className={r.estado === "Activa" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>{r.estado}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {can("her_inventario", "edit") && <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={!!bulkConfirm} onOpenChange={(o) => !o && setBulkConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkConfirm?.action === "deactivate" ? "¿Dar de baja seleccionadas?" : "¿Reactivar seleccionadas?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkConfirm?.action === "deactivate"
                ? `Se cambiará el estado a Inactiva de ${selected.length} herramienta(s). Si alguna tiene una asignación vigente, será cerrada automáticamente.`
                : `Se reactivarán ${selected.length} herramienta(s) volviendo a estar disponibles para asignación.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={runBulk}
              className={bulkConfirm?.action === "deactivate" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}
              data-testid="bulk-confirm-btn"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar" : "Nueva"} herramienta</DialogTitle>
            <DialogDescription>El ID se genera automáticamente al crear.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Marca *</Label><Input value={form.marca} onChange={(e) => setForm((s) => ({ ...s, marca: e.target.value }))} required /></div>
            <div className="space-y-2"><Label>Modelo</Label><Input value={form.modelo} onChange={(e) => setForm((s) => ({ ...s, modelo: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Serie</Label><Input value={form.serie} onChange={(e) => setForm((s) => ({ ...s, serie: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Fecha de compra</Label><Input type="date" value={form.fecha_compra} onChange={(e) => setForm((s) => ({ ...s, fecha_compra: e.target.value }))} /></div>
            <div className="col-span-2 space-y-2"><Label>Descripción</Label><Input value={form.descripcion} onChange={(e) => setForm((s) => ({ ...s, descripcion: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Valor ($)</Label><Input type="number" step="any" value={form.valor} onChange={(e) => setForm((s) => ({ ...s, valor: e.target.value }))} /></div>
            <DialogFooter className="col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white">{editing ? "Guardar" : "Crear"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
