import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BadgePercent, FileUp, Plus, Pencil, Power, RotateCcw } from "lucide-react";

const EMPTY = { nombre: "", cadena: "", modelo: "*", categoria_resolucion: "*", linea: "*",
  producto: "*", vigente_desde: "", vigente_hasta: "", observaciones: "" };

function PromoDialog({ item, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (item) setForm(item.id ? { ...EMPTY, ...item } : EMPTY); }, [item]);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const body = Object.fromEntries(Object.keys(EMPTY).map(k => [k, form[k]]));
      if (item.id) await api.put(`/tallerpay/promociones/${item.id}`, body);
      else await api.post("/tallerpay/promociones", body);
      toast.success("Promoción guardada"); onSaved();
    } catch (err) { toast.error(formatApiError(err)); } finally { setSaving(false); }
  };
  const labels = {
    nombre: "Nombre de la promoción", cadena: "Cadena comercial (* = cualquiera)",
    modelo: "Modelo (* = cualquiera)", categoria_resolucion: "Categoría de resolución (* = cualquiera)",
    linea: "Línea (* = cualquiera)", producto: "Producto (* = cualquiera)",
    vigente_desde: "Desde", vigente_hasta: "Hasta", observaciones: "Observaciones"
  };
  return <Dialog open={!!item} onOpenChange={open => !open && onClose()}>
    <DialogContent className="max-w-2xl max-h-[88vh] overflow-auto">
      <DialogHeader><DialogTitle>{item?.id ? "Editar promoción" : "Nueva promoción comercial"}</DialogTitle>
        <DialogDescription>La coincidencia se evalúa con la fecha de solución del ticket. Una promoción no modifica la tarifa de mano de obra.</DialogDescription>
      </DialogHeader>
      <form className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={submit}>
        {Object.keys(EMPTY).map(k => <div key={k} className={k==="observaciones"?"sm:col-span-2":"space-y-1"}>
          <Label>{labels[k]}</Label><Input type={k.startsWith("vigente_")?"date":"text"} required={["nombre","cadena","vigente_desde","vigente_hasta"].includes(k)}
            value={form[k] || ""} onChange={e => setForm(p=>({...p,[k]:e.target.value}))}/>
        </div>)}
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>Guardar promoción</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

export default function PromocionesPage() {
  const { can } = useAuth();
  const canEdit = can("tp_promociones", "edit");
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [state, setState] = useState("todos");
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const load = useCallback(async () => {
    try { const r = await api.get("/tallerpay/promociones", { params: { q, estado: state } }); setItems(r.data.items); }
    catch (e) { toast.error(formatApiError(e)); }
  }, [q, state]);
  useEffect(() => { load(); }, [load]);
  const toggle = async item => {
    try { await api.post(`/tallerpay/promociones/${item.id}/estado`, {activo:!item.activo});
      toast.success("Estado actualizado"); load(); }
    catch(e) { toast.error(formatApiError(e)); }
  };
  const downloadTemplate = async () => {
    try {
      const r = await api.get("/tallerpay/promociones/template", { responseType:"blob" });
      const url=URL.createObjectURL(r.data), a=document.createElement("a");
      a.href=url; a.download="plantilla_promociones_comerciales.xlsx"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const upload = async e => {
    const file=e.target.files?.[0]; if(!file)return;
    const data = new FormData(); data.append("file", file); setBusy(true); setResult(null);
    try {
      const r=await api.post("/tallerpay/promociones/import",data);
      setResult(r.data);
      if(r.data.confirmed){toast.success(`${r.data.inserted} promociones importadas`);load();}
      else toast.error("No se importaron filas; revise los errores");
    } catch(err) {toast.error(formatApiError(err));}
    finally {e.target.value="";setBusy(false);}
  };
  return <div className="p-4 sm:p-8 space-y-6" data-testid="tallerpay-promociones">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs uppercase tracking-widest text-neutral-500">Pago a talleres</p>
        <h1 className="text-3xl font-bold">Promociones comerciales</h1>
        <p className="text-sm text-neutral-500 mt-1">Reglas vigentes por cadena, modelo, producto y categoría de resolución. Responsable del pago: Comercial (CS_Com).</p></div>
      {canEdit && <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={downloadTemplate}>Descargar plantilla</Button>
        <label className="inline-flex items-center gap-2 border rounded-md px-3 py-2 text-sm cursor-pointer bg-white">
          <FileUp className="w-4 h-4"/>{busy?"Importando…":"Importar Excel"}
          <input className="hidden" type="file" accept=".xlsx" disabled={busy} onChange={upload}/>
        </label>
        <Button onClick={() => setEdit({})}><Plus className="w-4 h-4 mr-1"/>Nueva promoción</Button>
      </div>}
    </div>
    <p className="text-sm rounded-md border bg-white p-3">Las reglas CS_NoPago prevalecen sobre las promociones; una coincidencia comercial no autoriza pagar tickets no solucionados. Las condiciones comerciales y los valores de instalación se administran por separado.</p>
    {result&&<div className="rounded-md border p-3 text-sm" role="status">
      {result.confirmed?"Importación completa":"Importación cancelada"} · {result.inserted||0} registros nuevos
      {result.errors?.length>0&&<ul className="mt-2 text-red-700 list-disc pl-5">{result.errors.map((x,i)=><li key={i}>{x}</li>)}</ul>}
    </div>}
    <div className="flex flex-wrap items-center gap-3">
      <Input className="max-w-sm" placeholder="Buscar cadena, modelo o promoción" value={q} onChange={e=>setQ(e.target.value)}/>
      <Select value={state} onValueChange={setState}><SelectTrigger className="w-40"><SelectValue/></SelectTrigger>
        <SelectContent><SelectItem value="todos">Todas</SelectItem><SelectItem value="activos">Activas</SelectItem><SelectItem value="inactivos">Inactivas</SelectItem></SelectContent>
      </Select>
      <span className="text-sm text-neutral-500">{items.length} promociones</span>
    </div>
    <div className="rounded-lg border bg-white overflow-auto"><Table>
      <TableHeader><TableRow>
        <TableHead>Promoción</TableHead><TableHead>Cadena</TableHead><TableHead>Modelo</TableHead>
        <TableHead>Resolución</TableHead><TableHead>Producto / línea</TableHead><TableHead>Vigencia</TableHead>
        <TableHead>Estado</TableHead>{canEdit&&<TableHead>Acciones</TableHead>}
      </TableRow></TableHeader><TableBody>
        {items.map(p=><TableRow key={p.id}>
          <TableCell className="font-medium">{p.nombre}</TableCell><TableCell>{p.cadena}</TableCell>
          <TableCell>{p.modelo}</TableCell><TableCell>{p.categoria_resolucion}</TableCell>
          <TableCell>{p.producto} / {p.linea}</TableCell><TableCell>{p.vigente_desde} — {p.vigente_hasta}</TableCell>
          <TableCell>{p.activo?"Activa":"Inactiva"}</TableCell>
          {canEdit&&<TableCell><div className="flex gap-1">
            <Button size="sm" variant="ghost" title="Editar" onClick={()=>setEdit(p)}><Pencil className="w-4 h-4"/></Button>
            <Button size="sm" variant="ghost" title={p.activo?"Desactivar":"Activar"} onClick={()=>toggle(p)}>
              {p.activo?<Power className="w-4 h-4"/>:<RotateCcw className="w-4 h-4"/>}
            </Button></div></TableCell>}
        </TableRow>)}
        {items.length===0&&<TableRow><TableCell colSpan={canEdit?8:7} className="py-12 text-center text-neutral-500">
          <BadgePercent className="w-6 h-6 mx-auto mb-2"/>No hay promociones registradas
        </TableCell></TableRow>}
      </TableBody></Table></div>
    <PromoDialog item={edit} onClose={()=>setEdit(null)} onSaved={()=>{setEdit(null);load();}}/>
  </div>;
}
