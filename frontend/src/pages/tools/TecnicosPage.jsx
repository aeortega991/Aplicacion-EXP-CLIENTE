import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";

const empty = { nombre: "", apellido: "", codigo: "", ciudad: "" };

export default function TecnicosPage() {
  const [rows, setRows] = useState([]);
  const [cities, setCities] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [q, setQ] = useState("");

  const load = () => api.get("/tools/technicians").then((r) => setRows(r.data)).catch((e) => toast.error(formatApiError(e)));
  useEffect(() => {
    load();
    api.get("/cities").then((r) => setCities(r.data.cities || []));
  }, []);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => String(v || "").toLowerCase().includes(s)));
  }, [rows, q]);

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (r) => { setEditing(r); setForm({ nombre: r.nombre || "", apellido: r.apellido || "", codigo: r.codigo || "", ciudad: r.ciudad || "" }); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.patch(`/tools/technicians/${editing.id}`, form);
        toast.success("Técnico actualizado");
      } else {
        await api.post("/tools/technicians", form);
        toast.success("Técnico creado");
      }
      setOpen(false);
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <div className="p-8" data-testid="tools-tecnicos">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Inventario</div>
          <h1 className="text-3xl font-bold tracking-tight">Técnicos</h1>
          <p className="text-sm text-neutral-500 mt-1">{rows.length} {rows.length === 1 ? "técnico" : "técnicos"} registrados</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10 w-64" />
          </div>
          <Button onClick={openCreate} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="add-tech-btn">
            <Plus className="w-4 h-4" /> Agregar
          </Button>
        </div>
      </div>

      <Card className="border border-neutral-200 shadow-none overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
              <TableHead className="text-xs uppercase tracking-wider">Código</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Nombre</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Apellido</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Ciudad</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.codigo || "—"}</TableCell>
                <TableCell className="font-medium">{r.nombre}</TableCell>
                <TableCell>{r.apellido}</TableCell>
                <TableCell>{r.ciudad || "—"}</TableCell>
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
            <DialogTitle>{editing ? "Editar" : "Nuevo"} técnico</DialogTitle>
            <DialogDescription>Datos del técnico responsable de recibir herramientas.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Nombre *</Label><Input value={form.nombre} onChange={(e) => setForm((s) => ({ ...s, nombre: e.target.value }))} required /></div>
            <div className="space-y-2"><Label>Apellido *</Label><Input value={form.apellido} onChange={(e) => setForm((s) => ({ ...s, apellido: e.target.value }))} required /></div>
            <div className="space-y-2"><Label>Código *</Label><Input value={form.codigo} onChange={(e) => setForm((s) => ({ ...s, codigo: e.target.value }))} required /></div>
            <div className="space-y-2">
              <Label>Ciudad</Label>
              <Select value={form.ciudad || "__none__"} onValueChange={(v) => setForm((s) => ({ ...s, ciudad: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__none__">— Sin ciudad —</SelectItem>
                  {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
