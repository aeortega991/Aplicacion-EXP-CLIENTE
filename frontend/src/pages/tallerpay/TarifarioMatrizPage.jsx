import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Plus } from "lucide-react";

const LEVELS = [{value:"SL",label:"Leve (SL)"},{value:"SM",label:"Moderado (SM)"},{value:"SG",label:"Grave (SG)"}];

export default function TarifarioMatrizPage() {
  const { can } = useAuth();
  const canEdit = can("tp_tarifarios", "edit");
  const [technicians, setTechnicians] = useState([]);
  const [codigo, setCodigo] = useState("");
  const [lines, setLines] = useState([]);
  const [matrix, setMatrix] = useState([]);
  const [kmRate, setKmRate] = useState("");
  const [savedKmRate, setSavedKmRate] = useState(null);
  const [edit, setEdit] = useState({});
  const [lineName, setLineName] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = technicians.find(x=>x.codigo===codigo);

  const reload = useCallback(async()=>{
    try {
      const [a,b]=await Promise.all([api.get("/tools/technicians"),api.get("/tallerpay/catalogo/lineas")]);
      setTechnicians(a.data||[]);setLines(b.data.items.filter(x=>x.activo));
    } catch(e) { toast.error(formatApiError(e)); }
  },[]);
  useEffect(()=>{reload()},[reload]);

  const loadMatrix = useCallback(async()=>{
    if(!codigo){setMatrix([]);setKmRate("");setSavedKmRate(null);return}
    try {
      const [r,k]=await Promise.all([
        api.get("/tallerpay/matriz-tarifaria",{params:{tecnico_codigo:codigo}}),
        api.get("/tallerpay/tarifa-kilometraje",{params:{tecnico_codigo:codigo}})
      ]);
      setMatrix(r.data.items);setEdit({});
      setKmRate(k.data.item?.valor_km??"");
      setSavedKmRate(k.data.item?.valor_km??null);
    } catch(e) { toast.error(formatApiError(e)); }
  },[codigo]);
  useEffect(()=>{loadMatrix()},[loadMatrix]);

  const createLine = async e => {
    e.preventDefault();
    try {
      await api.post("/tallerpay/catalogo/lineas",{nombre:lineName});
      setLineName("");await reload();toast.success("Línea creada");
    } catch(e){toast.error(formatApiError(e))}
  };
  const save = async(linea,nivel) => {
    const key=`${linea}:${nivel}`;
    const item=matrix.find(x=>x.linea===linea&&x.nivel===nivel);
    const valor=edit[key]??item?.valor;
    if(!valor) return toast.error("Ingrese el importe");
    setBusy(true);
    try {
      await api.put("/tallerpay/matriz-tarifaria",{tecnico_codigo:codigo,linea,nivel,valor});
      await loadMatrix();toast.success("Tarifa vinculada al técnico");
    } catch(e){toast.error(formatApiError(e))}
    finally {setBusy(false)}
  };

  const saveKilometerRate = async () => {
    if(kmRate===""||!codigo) return toast.error("Ingrese la tarifa por kilómetro del técnico");
    setBusy(true);
    try {
      await api.put("/tallerpay/tarifa-kilometraje",{tecnico_codigo:codigo,valor_km:kmRate});
      await loadMatrix();
      toast.success("Tarifa por kilómetro guardada para este técnico");
    } catch(e){toast.error(formatApiError(e))}
    finally{setBusy(false)}
  };

  return <div className="p-4 sm:p-8 space-y-6" data-testid="tallerpay-matriz">
    <div><p className="text-xs uppercase tracking-widest text-neutral-500">Pago a talleres</p>
      <h1 className="text-3xl font-bold">Tarifarios por técnico</h1>
      <p className="text-sm text-neutral-500">Cada tarifa pertenece directamente al técnico seleccionado. La liquidación utiliza sus tarifas, sin relacionarlo con un taller.</p>
    </div>
    <section className="border rounded-lg bg-white p-4 space-y-3">
      <h2 className="font-semibold">Seleccionar técnico del sistema</h2>
      <Select value={codigo||undefined} onValueChange={setCodigo}>
        <SelectTrigger className="max-w-lg"><SelectValue placeholder="Seleccione un técnico"/></SelectTrigger>
        <SelectContent>{technicians.map(t=><SelectItem value={t.codigo} key={t.id||t.codigo}>
          {t.codigo} · {t.nombre} {t.apellido||""}</SelectItem>)}</SelectContent>
      </Select>
      {selected&&<p className="text-sm text-neutral-500">Código SAP: {selected.codigo} · {selected.nombre} {selected.apellido||""}</p>}
    </section>
    <section className="border rounded-lg bg-white p-4 space-y-3">
      <h2 className="font-semibold">Líneas de producto</h2>
      <div className="flex flex-wrap gap-2">{lines.map(x=><span className="px-3 py-1 border rounded-full text-sm" key={x.codigo}>{x.nombre}</span>)}</div>
      {canEdit&&<form className="flex gap-2 max-w-md" onSubmit={createLine}>
        <Input required value={lineName} onChange={e=>setLineName(e.target.value)} placeholder="Agregar una línea"/>
        <Button type="submit" variant="outline"><Plus className="w-4 h-4 mr-1"/>Crear</Button>
      </form>}
    </section>
    {selected&&<section className="border rounded-lg bg-white p-4 space-y-3">
      <h2 className="font-semibold">Tarifa de kilometraje del técnico</h2>
      <p className="text-sm text-neutral-500">Este importe en USD por km se configura individualmente; no existe una tarifa estándar para todos los técnicos. Los kilómetros de cada ticket foráneo se ingresan en Liquidaciones.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label>USD por kilómetro</Label>
          <Input className="w-44" aria-label="Tarifa por kilómetro" type="number" step="0.01" min="0.01" value={kmRate}
            disabled={!canEdit} placeholder="Ej. 0.25" onChange={e=>setKmRate(e.target.value)}/></div>
        {canEdit&&<Button onClick={saveKilometerRate} disabled={busy||!kmRate}><Save className="w-4 h-4 mr-2"/>Guardar tarifa de km</Button>}
      </div>
      <p className="text-xs text-neutral-500">{savedKmRate!==null?"Tarifa guardada: USD "+savedKmRate+"/km":"Este técnico aún no tiene tarifa de kilometraje configurada."}</p>
    </section>}
    {selected&&<section className="border rounded-lg bg-white p-4 space-y-3">
      <h2 className="font-semibold">Matriz de tarifas — {selected.nombre} {selected.apellido||""}</h2>
      <p className="text-sm text-neutral-500">Los valores son finales, con IVA incluido cuando corresponda. SB/SL → Leve; SM → Moderado; SG/SE → Grave.</p>
      <div className="overflow-auto"><table className="w-full border-collapse text-sm">
        <thead><tr className="bg-neutral-50 border-b"><th className="p-3 text-left">Línea</th>{LEVELS.map(x=><th key={x.value} className="p-3 text-left">{x.label}</th>)}</tr></thead>
        <tbody>{lines.map(line=><tr key={line.codigo} className="border-b">
          <th className="p-3 text-left">{line.nombre}</th>
          {LEVELS.map(level=>{
            const key=`${line.codigo}:${level.value}`;
            const saved=matrix.find(x=>x.linea===line.codigo&&x.nivel===level.value);
            return <td className="p-2" key={key}><div className="flex gap-1 min-w-40">
              <Input aria-label={`${line.nombre} ${level.label}`} type="number" min=".01" step=".01"
                value={edit[key]??saved?.valor??""} disabled={!canEdit}
                onChange={e=>setEdit(p=>({...p,[key]:e.target.value}))}/>
              {canEdit&&<Button type="button" size="icon" variant="outline" disabled={busy}
                onClick={()=>save(line.codigo,level.value)} title="Guardar">
                <Save className="w-4 h-4"/></Button>}
            </div></td>;
          })}
        </tr>)}</tbody>
      </table></div>
    </section>}
  </div>;
}
