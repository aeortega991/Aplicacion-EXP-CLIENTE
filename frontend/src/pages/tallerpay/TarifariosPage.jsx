import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError, money } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SearchSelect } from "@/components/SearchSelect";
import BulkUploadDialog from "@/components/BulkUploadDialog";
import { Plus, Pencil, Trash2, Paperclip, FileText, Image as ImageIcon, Eye, Upload, Loader2, Tags } from "lucide-react";
import { LINEAS, LineaBadges, lineaLabel } from "./constants";

const fmtPeso = (n) => Number(n).toLocaleString("es-EC", { maximumFractionDigits: 2 });
const fmtSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function TariffDialog({ open, initial, workshop, linea, onClose, onSaved }) {
  const [form, setForm] = useState({ peso: "", valor: "", descripcion: "", vigente_desde: "", linea });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm(initial?.id
      ? { peso: String(initial.peso), valor: String(initial.valor), descripcion: initial.descripcion || "", vigente_desde: initial.vigente_desde || "", linea: initial.linea }
      : { peso: "", valor: "", descripcion: "", vigente_desde: "", linea });
  }, [open, initial, linea]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(form.peso) > 0)) return toast.error("El peso debe ser mayor a 0");
    if (!(Number(form.valor) > 0)) return toast.error("El valor debe ser mayor a 0");
    setSaving(true);
    try {
      const body = { taller_id: workshop.id, linea: form.linea, peso: Number(form.peso), valor: Number(form.valor), descripcion: form.descripcion, vigente_desde: form.vigente_desde || null };
      if (initial?.id) await api.put(`/tallerpay/tarifarios/${initial.id}`, body);
      else await api.post("/tallerpay/tarifarios", body);
      toast.success(initial?.id ? "Tarifa actualizada" : "Tarifa registrada");
      onSaved();
    } catch (err) { toast.error(formatApiError(err)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="tariff-dialog">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Editar tarifa" : "Nueva tarifa"}</DialogTitle>
          <DialogDescription>{workshop?.codigo_sap} · {workshop?.nombre} · {lineaLabel(form.linea)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Peso de resolución *</Label><Input type="number" step="0.01" min="0.01" value={form.peso} onChange={set("peso")} data-testid="tariff-peso" /></div>
          <div className="space-y-1.5"><Label>Valor (USD) *</Label><Input type="number" step="0.01" min="0.01" value={form.valor} onChange={set("valor")} data-testid="tariff-valor" /></div>
          <div className="space-y-1.5 col-span-2"><Label>Descripción</Label><Input value={form.descripcion} onChange={set("descripcion")} placeholder="Ej. Reparación simple" data-testid="tariff-descripcion" /></div>
          <div className="space-y-1.5 col-span-2"><Label>Vigente desde</Label><Input type="date" value={form.vigente_desde} onChange={set("vigente_desde")} data-testid="tariff-vigente" /></div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving} className="bg-red-600 hover:bg-red-700 text-white" data-testid="tariff-save">{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FilesCard({ workshop, canEdit }) {
  const [files, setFiles] = useState([]);
  const [linea, setLinea] = useState("general");
  const [descripcion, setDescripcion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [del, setDel] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(() => {
    api.get(`/tallerpay/talleres/${workshop.id}/archivos`).then((r) => setFiles(r.data.items)).catch((e) => toast.error(formatApiError(e)));
  }, [workshop.id]);
  useEffect(() => { load(); }, [load]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("El archivo supera 10 MB"); fileRef.current.value = ""; return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("linea", linea);
      form.append("descripcion", descripcion);
      await api.post(`/tallerpay/talleres/${workshop.id}/archivos`, form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Archivo adjuntado");
      setDescripcion("");
      load();
    } catch (err) { toast.error(formatApiError(err)); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const view = async (f) => {
    const win = window.open("", "_blank");
    try {
      const r = await api.get(`/tallerpay/archivos/${f.id}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: f.content_type }));
      if (win) win.location.href = url; else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { if (win) win.close(); toast.error(formatApiError(e)); }
  };

  const doDelete = async () => {
    try { await api.delete(`/tallerpay/archivos/${del.id}`); toast.success("Archivo eliminado"); setDel(null); load(); }
    catch (e) { toast.error(formatApiError(e)); setDel(null); }
  };

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 space-y-4" data-testid="tariff-files-card">
      <div className="flex items-center gap-2"><Paperclip className="w-4 h-4 text-red-600" /><h2 className="font-semibold">Tarifario contractual</h2>
        <span className="text-xs text-neutral-500">PDF o imagen · máx. 10 MB</span></div>
      {canEdit && (
        <div className="flex flex-wrap items-end gap-3 rounded-md bg-neutral-50 border border-dashed border-neutral-300 p-3">
          <div className="space-y-1"><Label className="text-xs">Aplica a</Label>
            <Select value={linea} onValueChange={setLinea}>
              <SelectTrigger className="w-40 bg-white" data-testid="file-linea"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                {LINEAS.filter((l) => workshop.lineas.includes(l.value)).map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 flex-1 min-w-[180px]"><Label className="text-xs">Descripción</Label>
            <Input className="bg-white" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Contrato 2026 firmado" data-testid="file-descripcion" /></div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" className="hidden" onChange={upload} data-testid="file-input" />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="file-upload-button">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {uploading ? "Subiendo…" : "Adjuntar archivo"}
          </Button>
        </div>
      )}
      {files.length === 0 ? (
        <p className="text-sm text-neutral-500" data-testid="files-empty">No hay archivos adjuntos para este taller.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2.5" data-testid={`file-row-${f.id}`}>
              {f.content_type === "application/pdf" ? <FileText className="w-5 h-5 text-red-600 shrink-0" /> : <ImageIcon className="w-5 h-5 text-sky-600 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{f.original_filename}</div>
                <div className="text-xs text-neutral-500">{lineaLabel(f.linea)} · {fmtSize(f.size)} · {new Date(f.created_at).toLocaleDateString("es-EC")} · {f.uploaded_by?.name}{f.descripcion ? ` · ${f.descripcion}` : ""}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => view(f)} title="Ver" data-testid={`file-view-${f.id}`}><Eye className="w-4 h-4" /></Button>
              {canEdit && workshop.activo && <Button variant="ghost" size="sm" onClick={() => setDel(f)} title="Eliminar" data-testid={`file-delete-${f.id}`}><Trash2 className="w-4 h-4 text-red-600" /></Button>}
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar archivo?</AlertDialogTitle>
            <AlertDialogDescription>{del?.original_filename} dejará de estar disponible.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-red-600 hover:bg-red-700" data-testid="file-delete-confirm">Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default function TarifariosPage() {
  const { can } = useAuth();
  const canEditAny = can("tp_tarifarios", "edit");
  const [params, setParams] = useSearchParams();
  const [workshops, setWorkshops] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [linea, setLinea] = useState("blanca");
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const tallerId = params.get("taller") || "";
  const workshop = useMemo(() => workshops.find((w) => w.id === tallerId), [workshops, tallerId]);
  const canEdit = canEditAny && !!workshop?.activo;

  const loadWorkshops = useCallback(() => {
    api.get("/tallerpay/talleres").then((r) => setWorkshops(r.data.items)).catch((e) => toast.error(formatApiError(e)));
  }, []);
  useEffect(() => { loadWorkshops(); }, [loadWorkshops]);

  const loadTariffs = useCallback(() => {
    if (!tallerId) { setTariffs([]); return; }
    api.get("/tallerpay/tarifarios", { params: { taller_id: tallerId } }).then((r) => setTariffs(r.data.items)).catch((e) => toast.error(formatApiError(e)));
  }, [tallerId]);
  useEffect(() => { loadTariffs(); }, [loadTariffs]);

  useEffect(() => {
    if (workshop && !workshop.lineas.includes(linea)) setLinea(workshop.lineas[0]);
  }, [workshop, linea]);

  const rows = tariffs.filter((t) => t.linea === linea);
  const options = workshops.map((w) => ({ value: w.id, label: `${w.codigo_sap} · ${w.nombre}${w.activo ? "" : " (inactivo)"}` }));
  const refresh = () => { loadTariffs(); loadWorkshops(); };

  const doDelete = async () => {
    try { await api.delete(`/tallerpay/tarifarios/${del.id}`); toast.success("Tarifa eliminada"); setDel(null); refresh(); }
    catch (e) { toast.error(formatApiError(e)); setDel(null); }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6" data-testid="tallerpay-tarifarios">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Pago a talleres</div>
          <h1 className="text-3xl font-bold tracking-tight">Tarifarios</h1>
          <p className="text-sm text-neutral-500 mt-1">Valor a pagar por taller, línea de producto y peso de resolución.</p>
        </div>
        {canEditAny && (
          <BulkUploadDialog title="Importar tarifas" templateUrl="/tallerpay/tarifarios/template" importUrl="/tallerpay/tarifarios/import"
            templateName="plantilla_tarifarios.xlsx" onDone={refresh} testId="tariff-import-button"
            description="Una fila por código SAP + línea (blanca/cafe) + peso. Si la combinación ya existe, se actualiza el valor." />
        )}
      </div>

      <div className="max-w-xl space-y-1.5">
        <Label>Taller</Label>
        <SearchSelect value={tallerId} onChange={(v) => setParams(v ? { taller: v } : {})} options={options}
          placeholder={workshops.length ? "Seleccionar taller por código SAP o nombre" : "No hay talleres registrados"} testId="tariff-workshop-select" />
      </div>

      {!workshop ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-neutral-500" data-testid="tariff-no-workshop">
          <Tags className="w-8 h-8 mx-auto mb-2 text-neutral-300" />Seleccione un taller para ver y configurar su tarifario.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-neutral-200 bg-white p-5 flex flex-wrap items-center gap-x-8 gap-y-3" data-testid="tariff-workshop-summary">
            <div><div className="text-[11px] uppercase tracking-wider text-neutral-500">Código SAP</div><div className="font-mono font-semibold">{workshop.codigo_sap}</div></div>
            <div><div className="text-[11px] uppercase tracking-wider text-neutral-500">Taller</div><div className="font-medium">{workshop.nombre}</div></div>
            <div><div className="text-[11px] uppercase tracking-wider text-neutral-500">Ciudad</div><div>{workshop.ciudad || "—"}</div></div>
            <div><div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">Líneas</div><LineaBadges lineas={workshop.lineas} /></div>
            {!workshop.activo && <span className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-600">Taller inactivo · solo consulta</span>}
          </div>

          <section className="rounded-lg border border-neutral-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 pt-3">
              <div className="flex gap-1" role="tablist">
                {LINEAS.filter((l) => workshop.lineas.includes(l.value)).map((l) => (
                  <button key={l.value} role="tab" aria-selected={linea === l.value} onClick={() => setLinea(l.value)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${linea === l.value ? "border-red-600 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}
                    data-testid={`tariff-tab-${l.value}`}>
                    {l.label} <span className="ml-1 text-xs text-neutral-400">{tariffs.filter((t) => t.linea === l.value).length}</span>
                  </button>
                ))}
              </div>
              {canEdit && (
                <Button size="sm" onClick={() => setEdit({})} className="mb-2 bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="tariff-add-button"><Plus className="w-4 h-4" /> Nueva tarifa</Button>
              )}
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Peso de resolución</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Descripción</TableHead>
                <TableHead>Vigente desde</TableHead><TableHead>Actualizado</TableHead>{canEdit && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id} data-testid={`tariff-row-${t.linea}-${t.peso}`}>
                    <TableCell className="font-semibold">{fmtPeso(t.peso)}</TableCell>
                    <TableCell className="text-right font-mono">{money(t.valor)}</TableCell>
                    <TableCell className="text-sm">{t.descripcion || "—"}</TableCell>
                    <TableCell className="text-sm">{t.vigente_desde || "—"}</TableCell>
                    <TableCell className="text-xs text-neutral-500">{new Date(t.updated_at).toLocaleDateString("es-EC")} · {t.updated_by?.name}</TableCell>
                    {canEdit && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setEdit(t)} data-testid={`tariff-edit-${t.linea}-${t.peso}`}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setDel(t)} data-testid={`tariff-delete-${t.linea}-${t.peso}`}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-neutral-500" data-testid="tariff-empty">No hay tarifas para {lineaLabel(linea)}.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </section>

          <FilesCard workshop={workshop} canEdit={canEdit} />
        </>
      )}

      <TariffDialog open={!!edit} initial={edit?.id ? edit : null} workshop={workshop} linea={linea} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar tarifa?</AlertDialogTitle>
            <AlertDialogDescription>{del && `${lineaLabel(del.linea)} · peso ${fmtPeso(del.peso)} · ${money(del.valor)}`}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-red-600 hover:bg-red-700" data-testid="tariff-delete-confirm">Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
