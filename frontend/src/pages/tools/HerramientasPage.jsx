import { useEffect, useState, useMemo } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";

const empty = { marca: "", modelo: "", serie: "", descripcion: "", fecha_compra: "", valor: "" };

export default function HerramientasPage() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [q, setQ] = useState("");

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
        toast.success("Herramienta creada");
      }
      setOpen(false);
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
          <Button onClick={openCreate} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="add-tool-btn">
            <Plus className="w-4 h-4" /> Agregar
          </Button>
        </div>
      </div>

      <Card className="border border-neutral-200 shadow-none overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
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
              <TableRow key={r.id} data-testid="tool-row">
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
                  <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

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
