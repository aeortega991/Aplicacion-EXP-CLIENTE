import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Wallet, Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

const emptyForm = { nombre: "", codigo: "" };

export default function CuentasPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/expense-accounts").then((r) => setAccounts(r.data)).catch((e) => toast.error(formatApiError(e))).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (a) => { setEditing(a); setForm({ nombre: a.nombre, codigo: a.codigo }); setDialogOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.codigo.trim()) { toast.error("Descripción y código son obligatorios"); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/expense-accounts/${editing.id}`, form);
        toast.success("Cuenta actualizada");
      } else {
        await api.post("/expense-accounts", form);
        toast.success("Cuenta creada");
      }
      setDialogOpen(false);
      load();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`/expense-accounts/${toDelete.id}`);
      toast.success("Cuenta eliminada");
      setToDelete(null);
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const filtered = accounts.filter((a) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return String(a.nombre || "").toLowerCase().includes(s) || String(a.codigo || "").toLowerCase().includes(s);
  });

  return (
    <div className="p-8" data-testid="gastos-cuentas">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Gastos · Administración</div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="w-7 h-7 text-red-600" /> Cuentas contables
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Crea y edita las cuentas contables (descripción y código).</p>
        </div>
        <Button onClick={openCreate} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="add-account-btn">
          <Plus className="w-4 h-4" /> Nueva cuenta
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por descripción o código…" className="pl-9" data-testid="account-search" />
      </div>

      <Card className="border border-neutral-200 shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-neutral-50">
                <TableHead className="text-xs uppercase tracking-wider">Descripción</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Código</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-10 text-neutral-400">Cargando…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-10 text-neutral-400">Sin cuentas contables</TableCell></TableRow>
              ) : filtered.map((a) => (
                <TableRow key={a.id} data-testid={`account-row-${a.codigo}`}>
                  <TableCell className="font-medium">{a.nombre}</TableCell>
                  <TableCell className="font-mono text-neutral-600">{a.codigo}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)} data-testid={`edit-account-${a.codigo}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => setToDelete(a)} data-testid={`delete-account-${a.codigo}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-testid="account-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cuenta contable" : "Nueva cuenta contable"}</DialogTitle>
            <DialogDescription>Ingresa la descripción y el código numérico de la cuenta.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Descripción *</Label>
              <Input value={form.nombre} onChange={(e) => setForm((s) => ({ ...s, nombre: e.target.value }))} placeholder="Ej. Combustible y lubricantes" data-testid="account-nombre" />
            </div>
            <div className="space-y-1.5">
              <Label>Código *</Label>
              <Input value={form.codigo} onChange={(e) => setForm((s) => ({ ...s, codigo: e.target.value }))} placeholder="Ej. 61040000" className="font-mono" data-testid="account-codigo" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="bg-red-600 hover:bg-red-700 text-white" data-testid="account-save">
                {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear cuenta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cuenta contable</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar la cuenta "{toDelete?.nombre}" ({toDelete?.codigo})? Las solicitudes ya creadas conservan su cuenta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700" data-testid="confirm-delete-account">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
