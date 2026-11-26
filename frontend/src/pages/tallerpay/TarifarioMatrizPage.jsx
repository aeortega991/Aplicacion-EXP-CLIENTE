import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/SearchSelect";
import { Plus, Save, AlertTriangle } from "lucide-react";

const LEVELS = [{ value:"SL", label:"Leve (SL)" }, {value:"SM", label:"Moderado (SM)"}, {value:"SG", label:"Grave (SG)"}];

export default function TarifarioMatrizPage() {
  const { can } = useAuth();
  const canEdit = can("tp_tarifarios", "edit");
  const canCreateLine = can("tp_talleres", "edit");
  const [params, setParams] = useSearchParams();
  const [workshops, setWorkshops] = useState([]);
  const [lines, setLines] = useState([]);
  const [matrix, setMatrix] = useState([]);
  const [legacy, setLegacy] = useState([]);
  const [edit, setEdit] = useState({});
  const [lineName, setLineName] = useState("");
  const [mapping, setMapping] = useState({});
  const [saving, setSaving] = useState(false);
  const id = params.get("taller")||"";
  const workshop = useMemo(()=>workshops.find(w=>w.id===id),[workshops,id]);
  const permitted = lines.filter(l=>workshop?.lineas?.includes(l.codigo));
  const reload = useCallback(async()=>{
    try {
      const [w,l]=await Promise.all([api.get("/tallerpay/talleres"),api.get("/tallerpay/catalogo/lineas")]);
      setWorkshops(w.data.items);setLines(l.data.items);
    } catch(e){toast.error(formatApiError(e))}
  },[]);
  useEffect(()=>{reload()},[reload]);
  const loadMatrix = useCallback(async()=>{
    if(!id){setMatrix([]);setLegacy([]);return}
    try {
      const [m,l]=await Promise.all([
        api.get("/tallerpay/tarifarios/matriz",{params:{taller_id:id}}),
        api.get("/tallerpay/tarifarios/legado",{params:{taller_id:id}})
      ]);
      setMatrix(m.data.items);setLegacy(l.data.items);setEdit({});
    } catch(e){toast.error(formatApiError(e))}
  },[id]);
  useEffect(()=>{loadMatrix()},[loadMatrix]);
  const createLine = async(e)=>{
    e.preventDefault();try{await api.post("/tallerpay/catalogo/lineas",{nombre:lineName});setLineName("");toast.success("Línea creada");reload()}
    catch(err){toast.error(formatApiError(err))}
  };
  const save = async(linea,nivel)=>{
    const key=`${linea}:${nivel}`;
    const existing=matrix.find(x=>x.linea===linea&&x.nivel===nivel);
    const valor=edit[key]??existing?.valor;
    if(!valor) return toast.error("Introduzca una tarifa");
    setSaving(true);
    try{
      await api.put("/tallerpay/tarifarios/matriz",{taller_id:id,linea,nivel,valor});
      toast.success("Tarifa guardada");await loadMatrix();
    }catch(err){toast.error(formatApiError(err))}
    finally{setSaving(false)}
  };
  const migrate = async()=>{
    if(!window.confirm("¿Copiar las tarifas históricas mapeadas a la nueva matriz? Los datos anteriores no se eliminarán."))return;
    setSaving(true);
    try{
      const response=await api.post("/tallerpay/tarifarios/migrar",{mapa:mapping},{params:{taller_id:id}});
      if(response.data.applied){toast.success(`Se copiaron ${response.data.migrated} tarifas`);loadMatrix()}
      else toast.error(response.data.errors?.join("; ")||"No se pudo migrar");
    }catch(err){toast.error(formatApiError(err))}
    finally{setSaving(false)}
  };
  const options=workshops.map(w=>({value:w.id,label:`${w.codigo_sap} · ${w.nombre}`}));
  const legacyWeights=[...new Set(legacy.map(x=>String(x.peso)))];
  return <div className="p-4 sm:p-8 space-y-6" data-testid="tallerpay-matriz">
    <div><p className="text-xs uppercase tracking-widest text-neutral-500">Pago a talleres</p><h1 className="text-3xl font-bold">Tarifarios</h1>
      <p className="text-sm text-neutral-500 mt-1">Una matriz de tres tarifas por línea y taller. Los valores corresponden al importe final, con IVA incluido cuando aplique.</p>
    </div>
    <section className="rounded-lg border bg-white p-4 space-y-3"><h2 className="font-semibold">Líneas de producto</h2>
      <div className="flex flex-wrap gap-2">{lines.map(l=><span key={l.codigo} className="px-3 py-1 rounded-full border text-sm">{l.nombre}</span>)}</div>
      {canCreateLine&&<form onSubmit={createLine} className="flex gap-2 max-w-lg"><Input required minLength={2} placeholder="Nombre de nueva línea" value={lineName} onChange={e=>setLineName(e.target.value)}/>
        <Button type="submit"><Plus className="w-4 h-4 mr-1"/>Crear línea</Button></form>}
      <p className="text-xs text-neutral-500">Para asignar una línea nueva al taller, selecciónala al editar el taller en «Talleres tercerizados».</p>
    </section>
    <section className="space-y-2"><Label>Seleccionar taller</Label><SearchSelect value={id} onChange={v=>setParams(v?{taller:v}:{})} options={options} placeholder="Código SAP o taller"/></section>
    {workshop&&<><section className="rounded-lg border bg-white p-5 space-y-4">
      <div><h2 className="font-semibold">{workshop.codigo_sap} · {workshop.nombre}</h2><p className="text-sm text-neutral-500">{workshop.activo?"Taller activo":"Taller inactivo · solo lectura"}</p></div>
      <div className="overflow-auto"><table className="w-full text-sm border-collapse">
        <thead><tr className="bg-neutral-50 border-b"><th className="text-left p-3">Línea de producto</th>{LEVELS.map(level=><th key={level.value} className="text-left p-3">{level.label}</th>)}</tr></thead>
        <tbody>{permitted.map(l=><tr key={l.codigo} className="border-b"><th className="p-3 text-left">{l.nombre}</th>
          {LEVELS.map(level=>{
            const item=matrix.find(m=>m.linea===l.codigo&&m.nivel===level.value);
            const key=`${l.codigo}:${level.value}`;
            return <td key={key} className="p-2 min-w-[160px]"><div className="flex gap-1">
              <Input type="number" min="0.01" step="0.01" aria-label={`${l.nombre} ${level.label}`}
                disabled={!canEdit||!workshop.activo} value={edit[key]??item?.valor??""}
                onChange={e=>setEdit(p=>({...p,[key]:e.target.value}))} placeholder="USD 0.00"/>
              {canEdit&&workshop.activo&&<Button variant="outline" size="icon" title="Guardar tarifa" disabled={saving} onClick={()=>save(l.codigo,level.value)}><Save className="w-4 h-4"/></Button>}
            </div></td>;
          })}
        </tr>)}</tbody>
      </table></div>
      <p className="text-xs text-neutral-500">SB y SL utilizan Leve. SM utiliza Moderado. SG y SE utilizan Grave. Los pesos ACT nuevos se configuran desde Codificador ACT.</p>
    </section>
    {legacy.length>0&&<section className="rounded-lg border border-amber-200 bg-amber-50 p-5 space-y-3">
      <div className="flex items-start gap-2"><AlertTriangle className="w-5 h-5 text-amber-700"/><div>
        <h2 className="font-semibold">Tarifas anteriores conservadas ({legacy.length})</h2>
        <p className="text-sm">Los registros antiguos por peso numérico no se convierten automáticamente. Indica a qué nivel corresponde cada peso antes de copiarlos. Ningún registro histórico será eliminado.</p>
      </div></div>
      <div className="flex flex-wrap gap-3">{legacyWeights.map(weight=><div key={weight} className="space-y-1"><Label>Peso antiguo: {weight}</Label>
        <select className="block border rounded-md bg-white px-2 py-2 text-sm" value={mapping[weight]||""} onChange={e=>setMapping(p=>({...p,[weight]:e.target.value}))}>
          <option value="">Sin asignar</option>{LEVELS.map(level=><option key={level.value} value={level.value}>{level.label}</option>)}
        </select></div>)}</div>
      {canEdit&&workshop.activo&&<Button variant="outline" disabled={saving} onClick={migrate}>Copiar tarifas históricas a la matriz</Button>}
    </section>}
    </>}
  </div>;
}
