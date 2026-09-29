import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const empty = { username: "", name: "", email: "", role: "user", ciudad: "", region: "", password: "" };

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrador" },
  { value: "coordinador", label: "Coordinador" },
  { value: "lider", label: "Líder" },
  { value: "tesorero", label: "Tesorero" },
  { value: "gerente", label: "Gerente" },
  { value: "user", label: "Usuario" },
];
const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));
const ROLE_BADGE = {
  admin: "bg-red-600 text-white",
  gerente: "bg-purple-600 text-white",
  coordinador: "bg-blue-600 text-white",
  tesorero: "bg-amber-500 text-white",
  lider: "bg-indigo-500 text-white",
  user: "bg-neutral-200 text-neutral-800",
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [cities, setCities] = useState([]);
  const [regionMap, setRegionMap] = useState({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => {
    load();
    Promise.all([
      api.get("/cities").then((r) => r.data.cities || []).catch(() => []),
      api.get("/expenses/meta").then((r) => r.data).catch(() => ({ cities: [], regions: {} })),
    ]).then(([flotaCities, meta]) => {
      setRegionMap(meta.regions || {});
      const all = Array.from(new Set([...(flotaCities || []), ...((meta && meta.cities) || [])])).sort();
      setCities(all);
    });
  }, []);

  // Ciudades disponibles según la región seleccionada
  const ciudadOptions = form.region && regionMap[form.region] ? regionMap[form.region] : cities;

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ ...empty, ...u, password: "" }); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        const payload = { name: form.name, email: form.email, role: form.role, ciudad: form.ciudad || null, region: form.region || null };
        if (form.password) payload.password = form.password;
        await api.patch(`/users/${editing.id}`, payload);
        toast.success("Usuario actualizado");
      } else {
        await api.post("/users", { ...form, ciudad: form.ciudad || null, region: form.region || null });
        toast.success("Usuario creado");
      }
      setOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const doDelete = async () => {
    try {
      await api.delete(`/users/${confirmDel.id}`);
      toast.success("Usuario eliminado");
      setConfirmDel(null);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="p-8" data-testid="users-page">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Administración</div>
          <h1 className="text-3xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-sm text-neutral-500 mt-1">Gestión de usuarios y roles del sistema.</p>
        </div>
        <Button onClick={openCreate} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="add-user-button">
          <Plus className="w-4 h-4" /> Nuevo usuario
        </Button>
      </div>

      <Card className="border border-neutral-200 shadow-none">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
              <TableHead className="text-xs uppercase tracking-wider">Usuario</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Nombre</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Email</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Ciudad</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Región</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Rol</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} data-testid="user-row">
                <TableCell className="font-mono text-sm">@{u.username}</TableCell>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-neutral-600 text-sm">{u.email || "—"}</TableCell>
                <TableCell>{u.ciudad ? <Badge variant="secondary">{u.ciudad}</Badge> : <span className="text-neutral-400 text-sm">Todas</span>}</TableCell>
                <TableCell>{u.region ? <Badge variant="outline">{u.region}</Badge> : <span className="text-neutral-400 text-sm">—</span>}</TableCell>
                <TableCell>
                  <Badge className={ROLE_BADGE[u.role] || "bg-neutral-200 text-neutral-800"}>
                    {ROLE_LABELS[u.role] || u.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(u)} data-testid="user-edit-btn"><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDel(u)} data-testid="user-delete-btn"><Trash2 className="w-4 h-4 text-red-600" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" data-testid="user-form-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar" : "Nuevo"} usuario</DialogTitle>
            <DialogDescription>Configura los datos, rol y ciudad del usuario.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Usuario</Label>
              <Input value={form.username} onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))} disabled={!!editing} required data-testid="user-username-input" />
            </div>
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required data-testid="user-name-input" />
            </div>
            <div className="space-y-2">
              <Label>Email (opcional)</Label>
              <Input type="email" value={form.email || ""} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} data-testid="user-email-input" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select value={form.role} onValueChange={(v) => setForm((s) => ({ ...s, role: v }))}>
                  <SelectTrigger data-testid="user-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Región {["coordinador", "lider"].includes(form.role) ? <span className="text-xs text-red-500">*</span> : <span className="text-xs text-neutral-400">(opcional)</span>}</Label>
                <Select value={form.region || "__none__"} onValueChange={(v) => setForm((s) => ({ ...s, region: v === "__none__" ? "" : v, ciudad: "" }))}>
                  <SelectTrigger data-testid="user-region-select"><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sin región —</SelectItem>
                    {Object.keys(regionMap).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Ciudad {form.role === "admin" ? <span className="text-xs text-neutral-400">(opcional)</span> : null}{form.region ? <span className="text-xs text-neutral-400"> · región {form.region}</span> : null}</Label>
                <Select value={form.ciudad || "__all__"} onValueChange={(v) => setForm((s) => ({ ...s, ciudad: v === "__all__" ? "" : v }))}>
                  <SelectTrigger data-testid="user-ciudad-select"><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="__all__">— Sin restricción —</SelectItem>
                    {ciudadOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{editing ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} required={!editing} data-testid="user-password-input" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white" data-testid="user-submit-btn">
                {editing ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>@{confirmDel?.username} será eliminado del sistema.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
