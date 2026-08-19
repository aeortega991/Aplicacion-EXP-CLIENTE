import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getModule } from "@/config/modules";
import api, { formatApiError, money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

const fmtCell = (val, key) => {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    try { return new Date(val).toLocaleDateString("es-EC"); } catch { return val; }
  }
  if (/\$|Importe|Costo|Impuesto|Debe|Pagado|Total Combustible|Gasto/i.test(key) && !isNaN(Number(val))) {
    return money(val);
  }
  return String(val);
};

const statusColor = (val) => {
  const v = String(val || "").toLowerCase();
  if (["activo", "vigente", "pagado", "disponible", "al día"].includes(v)) return "bg-emerald-100 text-emerald-800";
  if (["inactivo", "vencida", "pendiente", "baja"].includes(v)) return "bg-red-100 text-red-800";
  if (["parcial", "por vencer", "en taller", "en ruta", "ingresar a taller", "aun no"].includes(v)) return "bg-amber-100 text-amber-800";
  return "";
};

export default function ModulePage({ moduleKey }) {
  const mod = getModule(moduleKey);
  const { isAdmin } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [dynamicOptions, setDynamicOptions] = useState({}); // sourceName -> [values]

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/modules/${moduleKey}`);
      setRecords(data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [moduleKey]);

  // Load dynamic options for select fields
  useEffect(() => {
    const sources = [...new Set(mod.fields.filter((f) => f.dynamicSource).map((f) => f.dynamicSource))];
    sources.forEach(async (src) => {
      try {
        const { data } = await api.get(`/modules/${src}`);
        setDynamicOptions((s) => ({ ...s, [src]: data }));
      } catch {}
    });
  }, [mod]);

  const filtered = useMemo(() => {
    if (!search) return records;
    const q = search.toLowerCase();
    return records.filter((r) =>
      Object.values(r).some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [records, search]);

  // Recompute derived fields whenever formData changes
  const derivedData = useMemo(() => {
    const d = { ...formData };
    mod.fields.forEach((f) => {
      if (f.derived) d[f.key] = f.derived(d);
    });
    return d;
  }, [formData, mod]);

  const openCreate = () => {
    const initial = {};
    mod.fields.forEach((f) => { initial[f.key] = ""; });
    setFormData(initial);
    setEditing(null);
    setOpenForm(true);
  };

  const openEdit = (rec) => {
    const d = {};
    mod.fields.forEach((f) => { d[f.key] = rec[f.key] ?? ""; });
    setFormData(d);
    setEditing(rec);
    setOpenForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = {};
    mod.fields.forEach((f) => {
      let v = f.derived ? f.derived(formData) : formData[f.key];
      if (v === "") { payload[f.key] = null; return; }
      if (f.type === "number" && v !== null && v !== "") v = Number(v);
      payload[f.key] = v;
    });
    try {
      if (editing) {
        await api.put(`/modules/${moduleKey}/${editing.id}`, { data: payload });
        toast.success("Registro actualizado");
      } else {
        await api.post(`/modules/${moduleKey}`, { data: payload });
        toast.success("Registro creado");
      }
      setOpenForm(false);
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/modules/${moduleKey}/${confirmDelete.id}`);
      toast.success("Registro eliminado");
      setConfirmDelete(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const columns = mod.listColumns;

  const getFieldOptions = (f) => {
    if (f.options) return f.options;
    if (f.dynamicSource) {
      const rows = dynamicOptions[f.dynamicSource] || [];
      const key = f.sourceKey || "Placa Vehiculo";
      return [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();
    }
    return [];
  };

  return (
    <div className="p-8" data-testid={`module-${moduleKey}-page`}>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Módulo</div>
          <h1 className="text-3xl font-bold tracking-tight">{mod.label}</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {records.length} {records.length === 1 ? "registro" : "registros"} en el sistema
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <Input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 w-64" data-testid={`${moduleKey}-search-input`} />
          </div>
          <Button onClick={openCreate} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid={`${moduleKey}-add-button`}>
            <Plus className="w-4 h-4" /> Agregar
          </Button>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-neutral-50">
                {columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap text-xs uppercase tracking-wider text-neutral-600 font-semibold">
                    {mod.fields.find((f) => f.key === c)?.label || c}
                  </TableHead>
                ))}
                <TableHead className="w-32 text-right text-xs uppercase tracking-wider text-neutral-600 font-semibold">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-10 text-neutral-500">Cargando…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-10 text-neutral-500">Sin registros</TableCell></TableRow>
              ) : filtered.slice(0, 500).map((r) => (
                <TableRow key={r.id} className="hover:bg-neutral-50" data-testid={`${moduleKey}-row`}>
                  {columns.map((c) => {
                    const val = r[c];
                    const isStatus = /Estado|Status|Calificaci/i.test(c);
                    return (
                      <TableCell key={c} className="text-sm whitespace-nowrap">
                        {isStatus && val ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor(val)}`}>
                            {String(val)}
                          </span>
                        ) : (
                          <span className={/\$|Importe|Costo|Impuesto|Debe|Pagado|Km|Odómetro|Año|Puntos|Galón|gal/i.test(c) ? "font-mono" : ""}>
                            {fmtCell(val, c)}
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)} data-testid={`${moduleKey}-edit-btn`}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(r)} data-testid={`${moduleKey}-delete-btn`}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 500 && (
          <div className="p-3 text-xs text-neutral-500 border-t border-neutral-200 bg-neutral-50">
            Mostrando 500 de {filtered.length} registros. Usa el buscador para filtrar.
          </div>
        )}
      </div>

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid={`${moduleKey}-form-dialog`}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar" : "Nuevo"} — {mod.label}</DialogTitle>
            <DialogDescription>Completa los campos. Los campos marcados (auto) se calculan automáticamente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mod.fields.map((f) => {
              const value = f.derived ? derivedData[f.key] : formData[f.key];
              const isDerived = !!f.derived;
              return (
                <div key={f.key} className={f.type === "textarea" ? "md:col-span-2 space-y-2" : "space-y-2"}>
                  <Label htmlFor={f.key} className="text-xs">
                    {f.label}{f.required && <span className="text-red-600"> *</span>}
                  </Label>
                  {isDerived ? (
                    <Input id={f.key} value={value ?? ""} readOnly className="bg-neutral-100 font-mono" data-testid={`${moduleKey}-field-${f.key}`} />
                  ) : f.type === "select" ? (
                    <Select
                      value={formData[f.key] ? String(formData[f.key]) : ""}
                      onValueChange={(v) => setFormData((s) => ({ ...s, [f.key]: v }))}
                    >
                      <SelectTrigger id={f.key} data-testid={`${moduleKey}-field-${f.key}`}>
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {getFieldOptions(f).map((op) => (
                          <SelectItem key={op} value={op}>{op}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : f.type === "textarea" ? (
                    <Textarea id={f.key} value={formData[f.key] || ""} onChange={(e) => setFormData((s) => ({ ...s, [f.key]: e.target.value }))} data-testid={`${moduleKey}-field-${f.key}`} />
                  ) : (
                    <Input
                      id={f.key}
                      type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                      value={formData[f.key] ?? ""}
                      onChange={(e) => setFormData((s) => ({ ...s, [f.key]: e.target.value }))}
                      required={f.required}
                      step={f.type === "number" ? "any" : undefined}
                      data-testid={`${moduleKey}-field-${f.key}`}
                    />
                  )}
                </div>
              );
            })}
            <DialogFooter className="md:col-span-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white" data-testid={`${moduleKey}-submit-btn`}>
                {editing ? "Guardar cambios" : "Crear registro"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-red-600 hover:bg-red-700" data-testid={`${moduleKey}-confirm-delete`}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
