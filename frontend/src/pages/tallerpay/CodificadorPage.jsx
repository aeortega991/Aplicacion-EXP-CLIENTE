import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileUp, Plus, Search } from "lucide-react";

const LEVELS = [{ value: "SL", label: "SL · Leve" }, { value: "SM", label: "SM · Moderado" }, { value: "SG", label: "SG · Grave" }];
const BASE = { codigo: "", nombre: "", nivel_tarifario: "SL" };

export default function CodificadorPage() {
  const { can } = useAuth();
  const canEdit = can("tp_codificador", "edit");
  const [codes, setCodes] = useState([]);
  const [weights, setWeights] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(BASE);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const load = useCallback(async () => {
    try {
      const [a,b,c] = await Promise.all([
        api.get("/tallerpay/act"), api.get("/tallerpay/catalogo/pesos"), api.get("/tallerpay/act/importaciones")
      ]);
      setCodes(a.data.items); setWeights(b.data.items); setHistory(c.data.items);
    } catch (e) { toast.error(formatApiError(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const createWeight = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.post("/tallerpay/catalogo/pesos", form);
      setForm(BASE); toast.success("Peso ACT registrado"); load();
    } catch(e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };

  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setResult(null);
    try {
      const data = new FormData(); data.append("file", file);
      const r = await api.post("/tallerpay/act/import", data);
      setResult(r.data);
      if (r.data.confirmed) { toast.success("Codificador importado"); load(); }
      else toast.error("Importación detenida: revise los errores");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { e.target.value = ""; setBusy(false); }
  };
  const shown = codes.filter(c => `${c.codigo} ${c.descripcion}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="p-4 sm:p-8 space-y-6" data-testid="tallerpay-codificador">
    <div><div className="text-xs uppercase tracking-widest text-neutral-500">Pago a talleres</div>
      <h1 className="text-3xl font-bold">Codificador ACT</h1>
      <p className="text-sm text-neutral-500 mt-1">El peso original se normaliza a SL, SM o SG. La equivalencia es solo informativa.</p></div>
    <section className="rounded-lg border bg-white p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap"><h2 className="font-semibold">Catálogo de pesos ACT</h2>
        <span className="text-xs text-neutral-500">{weights.length} pesos configurados</span></div>
      <div className="flex flex-wrap gap-2">
        {weights.map(w => <span key={w.codigo} className="rounded-md border bg-neutral-50 px-3 py-2 text-sm">{w.codigo} · {w.nombre} → <strong>{w.nivel_tarifario}</strong></span>)}
      </div>
      {canEdit && <form onSubmit={createWeight} className="flex flex-wrap items-end gap-3">
        <div><Label>Nuevo código</Label><Input required maxLength={16} placeholder="SX" value={form.codigo} onChange={e=>setForm(p=>({...p,codigo:e.target.value}))} /></div>
        <div><Label>Descripción</Label><Input required placeholder="Peso adicional" value={form.nombre} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} /></div>
        <div><Label>Nivel de pago</Label><Select value={form.nivel_tarifario} onValueChange={v=>setForm(p=>({...p,nivel_tarifario:v}))}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{LEVELS.map(l=><SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
        </Select></div>
        <Button type="submit" disabled={busy}><Plus className="w-4 h-4 mr-1"/>Crear peso</Button>
      </form>}
    </section>
    <section className="rounded-lg border bg-white p-5 space-y-3">
      <h2 className="font-semibold">Importar Codificador ACT</h2>
      <p className="text-sm text-neutral-600">Archivo .xlsx con columnas de código ACT y peso; opcionales: descripción y equivalencia. No se importará ninguna fila si existen errores.</p>
      {canEdit && <label className="inline-flex items-center gap-2 rounded-md border px-4 py-2 cursor-pointer text-sm hover:bg-neutral-50">
        <FileUp className="w-4 h-4"/>{busy?"Procesando…":"Seleccionar Excel"}<input type="file" accept=".xlsx" className="hidden" disabled={busy} onChange={upload}/>
      </label>}
      {result && <div role="status" className="rounded-md bg-neutral-50 border p-3 text-sm">
        <div>{result.confirmed ? "Importación completada" : "No se guardaron registros"} · {result.inserted} nuevos · {result.updated} actualizados</div>
        {result.errors?.length>0 && <ul className="mt-2 text-red-700 list-disc pl-5">{result.errors.map((err,i)=><li key={i}>{err}</li>)}</ul>}
      </div>}
    </section>
    <section className="rounded-lg border bg-white overflow-hidden">
      <div className="flex items-center justify-between p-4 gap-3">
        <h2 className="font-semibold">Códigos importados ({codes.length})</h2>
        <div className="relative"><Search className="absolute top-2.5 left-2 w-4 h-4 text-neutral-400"/><Input className="pl-8" placeholder="Buscar código o descripción" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      </div>
      <div className="overflow-auto max-h-[480px]"><Table><TableHeader><TableRow>
        <TableHead>Código</TableHead><TableHead>Descripción</TableHead><TableHead>Peso original</TableHead><TableHead>Tarifa</TableHead><TableHead>Equivalencia</TableHead>
      </TableRow></TableHeader><TableBody>
        {shown.map(item=><TableRow key={item.codigo}><TableCell className="font-mono">{item.codigo}</TableCell><TableCell>{item.descripcion}</TableCell>
          <TableCell>{item.peso_original}</TableCell><TableCell className="font-semibold">{item.nivel_tarifario}</TableCell><TableCell>{item.equivalencia||"—"}</TableCell></TableRow>)}
        {shown.length===0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-neutral-500">Sin registros</TableCell></TableRow>}
      </TableBody></Table></div>
    </section>
    <section className="rounded-lg border bg-white p-4"><h2 className="font-semibold mb-2">Últimas importaciones</h2>
      {history.length===0?<p className="text-sm text-neutral-500">No hay importaciones.</p>:
        history.map(h=><p key={h.id} className="text-sm py-1 border-b">{h.filename} · {h.total} filas · {h.created_at?.slice(0,10)} · {h.user?.name}</p>)}
    </section>
  </div>;
}
