import { useCallback,useEffect,useMemo,useState } from "react";
import api,{formatApiError} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table,TableHeader,TableRow,TableHead,TableBody,TableCell } from "@/components/ui/table";
import { Select,SelectTrigger,SelectValue,SelectContent,SelectItem } from "@/components/ui/select";
import { FileSpreadsheet,Save,Lock,Search } from "lucide-react";

const formatMoney=v=>"USD "+Number(v||0).toFixed(2);

export default function LiquidacionesPage(){
  const {user,can}=useAuth();
  const canEdit=can("tp_liquidaciones","edit");
  const canEditClosed=["admin","coordinador"].includes(user?.role);
  const [period,setPeriod]=useState("2026-10");
  const [technicianCode,setTechnicianCode]=useState("");
  const [techs,setTechs]=useState([]);
  const [kms,setKms]=useState({}),[preview,setPreview]=useState(null);
  const [drafts,setDrafts]=useState([]),[active,setActive]=useState(null);
  const [busy,setBusy]=useState(false),[reason,setReason]=useState("");
  const [adjust,setAdjust]=useState({ticket_id:"",nuevo_importe:"",motivo:""});
  const [special,setSpecial]=useState({linea:"",categoria_resolucion:"",valor:""});
  const [specials,setSpecials]=useState([]),[lines,setLines]=useState([]);

  const refresh=useCallback(async()=>{
    try{
      const [b,c]=await Promise.all([
        api.get("/tallerpay/liquidaciones/tecnicos",{params:{periodo:period}}),
        api.get("/tallerpay/liquidaciones",{params:{periodo:period}})]);
      setTechs(b.data.items||[]);setDrafts(c.data.items||[]);
    }catch(e){toast.error(formatApiError(e))}
  },[period]);
  useEffect(()=>{refresh()},[refresh]);
  useEffect(()=>{setPreview(null);setTechnicianCode("");setKms({});setActive(null)},[period]);
  useEffect(()=>{setPreview(null);setKms({});setActive(null)},[technicianCode]);
  useEffect(()=>{
    api.get("/tallerpay/catalogo/lineas").then(r=>setLines(r.data.items||[])).catch(()=>{});
  },[]);
  const loadSpecial=useCallback(async()=>{
    if(!technicianCode){setSpecials([]);return}
    try{const r=await api.get("/tallerpay/liquidaciones/especiales",{params:{tecnico_codigo:technicianCode}});
      setSpecials(r.data.items||[]);
    }catch(e){toast.error(formatApiError(e))}
  },[technicianCode]);
  useEffect(()=>{loadSpecial()},[loadSpecial]);
  const permittedLines=lines.filter(x=>x.activo);

  const getPayload=()=>({periodo:period,tecnico_codigo:technicianCode,kilometros:kms});
  const previewNow=async()=>{
    setBusy(true);
    try{const r=await api.post("/tallerpay/liquidaciones/preview",getPayload());setPreview(r.data);
      if(r.data.total_errores)toast.error("Hay tickets pendientes de completar");
    }catch(e){toast.error(formatApiError(e))}finally{setBusy(false)}
  };
  const create=async()=>{
    setBusy(true);
    try{const r=await api.post("/tallerpay/liquidaciones",getPayload());
      setActive(r.data);setPreview(null);toast.success("Borrador de liquidación creado");refresh();
    }catch(e){toast.error(formatApiError(e))}finally{setBusy(false)}
  };
  const open=async(id)=>{
    try{const r=await api.get(`/tallerpay/liquidaciones/${id}`);setActive(r.data);
      setKms(Object.fromEntries((r.data.tickets||[]).filter(x=>x.km!==null).map(x=>[x.ticket_id,x.km])));
    }catch(e){toast.error(formatApiError(e))}
  };
  const updateKm=async()=>{
    if(active?.estado==="CERRADO"&&!reason.trim()){toast.error("Se requiere motivo para modificar un cierre");return}
    setBusy(true);
    try{const target=(active.tickets||[]).filter(x=>x.es_foraneo&&x.clasificacion!=="CS_NoPago"&&x.clasificacion!=="PENDIENTE");
      const payload=Object.fromEntries(target.filter(x=>kms[x.ticket_id]!==undefined).map(x=>[x.ticket_id,kms[x.ticket_id]]));
      const r=await api.put(`/tallerpay/liquidaciones/${active.id}/kilometros`,{kilometros:payload,motivo:reason});
      setActive(r.data);setReason("");toast.success("Kilometraje actualizado");refresh();
    }catch(e){toast.error(formatApiError(e))}finally{setBusy(false)}
  };
  const adjustPrice=async()=>{
    if(!adjust.ticket_id||!adjust.nuevo_importe||!adjust.motivo.trim()){toast.error("Complete ticket, valor y motivo");return}
    setBusy(true);
    try{
      const r=await api.put(`/tallerpay/liquidaciones/${active.id}/ajustar`,adjust);
      setActive(r.data);setAdjust({ticket_id:"",nuevo_importe:"",motivo:""});
      toast.success("Ajuste registrado en historial");refresh();
    }catch(e){toast.error(formatApiError(e))}finally{setBusy(false)}
  };
  const close=async()=>{
    if(!window.confirm("¿Cerrar la liquidación? Los cambios posteriores serán solo de admin/coordinador."))return;
    setBusy(true);
    try{const r=await api.post(`/tallerpay/liquidaciones/${active.id}/cerrar`,{motivo:reason});
      setActive(r.data);setReason("");refresh();toast.success("Liquidación cerrada");
    }catch(e){toast.error(formatApiError(e))}finally{setBusy(false)}
  };
  const exportFile=async()=>{
    try{const r=await api.get(`/tallerpay/liquidaciones/${active.id}/excel`,{responseType:"blob"});
      const url=URL.createObjectURL(r.data),a=document.createElement("a");
      a.href=url;a.download=`TallerPay_${active.tecnico_codigo}_${active.periodo}.xlsx`;a.click();URL.revokeObjectURL(url);
    }catch(e){toast.error(formatApiError(e))}
  };
  const specialSave=async()=>{
    setBusy(true);
    try{await api.put("/tallerpay/liquidaciones/especiales",{...special,tecnico_codigo:technicianCode});
      setSpecial({linea:"",categoria_resolucion:"",valor:""});await loadSpecial();toast.success("Tarifa especial registrada");
    }catch(e){toast.error(formatApiError(e))}finally{setBusy(false)}
  };
  const rows=active?.tickets||preview?.tickets||[];
  const totals=active?.totales||preview?.totales||{};
  const readonly=!!active&&active.estado==="CERRADO"&&!canEditClosed;
  const editableKm=canEdit&&!readonly;
  const kmRows=rows.filter(x=>x.es_foraneo&&x.clasificacion!=="CS_NoPago");
  return <div className="p-4 sm:p-8 space-y-6" data-testid="tallerpay-liquidaciones">
    <div><p className="text-xs uppercase tracking-widest text-neutral-500">Pago a talleres</p>
      <h1 className="text-3xl font-bold">Liquidaciones</h1>
      <p className="text-sm text-neutral-500">Selecciona un técnico del sistema y el mes de solución. Se liquidan únicamente los tickets asignados a ese técnico en SAP, usando sus propias tarifas.</p></div>

    <section className="p-5 bg-white rounded-lg border space-y-4">
      <h2 className="font-semibold">1. Selección de período y técnico</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1"><Label>Mes de solución</Label><Input type="month" value={period} onChange={e=>setPeriod(e.target.value)} className="w-44"/></div>
        <div className="space-y-1"><Label>Técnico a liquidar</Label>
          <Select value={technicianCode||undefined} onValueChange={setTechnicianCode}>
            <SelectTrigger className="min-w-72"><SelectValue placeholder="Seleccione un técnico de SAP"/></SelectTrigger>
            <SelectContent>{techs.map(t=><SelectItem value={t.codigo} key={t.codigo}>{t.nombre||t.codigo} · {t.codigo} ({t.tickets} tickets)</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-sm text-neutral-500">La selección es individual; no se solicita taller ni se combinan tickets de varios técnicos.</p>
      <Button disabled={busy||!technicianCode} onClick={previewNow}><Search className="w-4 h-4 mr-2"/>Preparar liquidación</Button>
    </section>

    {technicianCode&&<section className="bg-white rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold">Tarifas especiales por resolución (por ejemplo, Instalación Nivel 1)</h2>
      <p className="text-sm text-neutral-500">Estas tarifas sustituyen SL/SM/SG para la resolución indicada; si hay promoción comercial aplicable, el precio de la promoción prevalece sobre ambas.</p>
      {canEdit&&<div className="flex flex-wrap gap-2">
        <Select value={special.linea||undefined} onValueChange={v=>setSpecial(p=>({...p,linea:v}))}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Línea"/></SelectTrigger>
          <SelectContent>{permittedLines.map(x=><SelectItem key={x.codigo} value={x.codigo}>{x.nombre}</SelectItem>)}</SelectContent></Select>
        <Input className="w-60" placeholder="Categoría de resolución" value={special.categoria_resolucion} onChange={e=>setSpecial(p=>({...p,categoria_resolucion:e.target.value}))}/>
        <Input className="w-36" type="number" min=".01" step=".01" placeholder="Valor USD" value={special.valor} onChange={e=>setSpecial(p=>({...p,valor:e.target.value}))}/>
        <Button disabled={busy||!special.linea||!special.categoria_resolucion||!special.valor} onClick={specialSave}><Save className="w-4 h-4 mr-1"/>Guardar</Button>
      </div>}
      <div className="flex flex-wrap gap-2">{specials.map(x=><span key={x.id} className="rounded-md border px-3 py-1 text-sm">{x.linea} · {x.categoria_resolucion}: {formatMoney(x.valor)}</span>)}</div>
    </section>}

    <section className="bg-white rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold">2. Kilómetros manuales de tickets foráneos</h2>
      <p className="text-sm text-neutral-500">Es obligatorio registrar los kilómetros de cada ticket foráneo pagable (se admite 0). El sistema utiliza la tarifa USD/km configurada en Tarifarios para este técnico; no existe un valor estándar.</p>
      {kmRows.length? <div className="overflow-auto max-h-80"><Table><TableHeader><TableRow><TableHead>Ticket</TableHead><TableHead>Técnico</TableHead><TableHead>Ruta</TableHead><TableHead>Clasificación</TableHead><TableHead>USD/km del técnico</TableHead><TableHead>Kilómetros</TableHead></TableRow></TableHeader><TableBody>
        {kmRows.map(x=><TableRow key={x.ticket_id}>
          <TableCell>{x.ticket_id}</TableCell><TableCell>{x.tecnico}</TableCell><TableCell>{x.ruta}</TableCell><TableCell>{x.clasificacion}</TableCell><TableCell>{x.tarifa_km===null?"Sin tarifa":formatMoney(x.tarifa_km)}</TableCell>
          <TableCell><Input type="number" step=".01" min="0" disabled={!editableKm} className="w-32" placeholder="0.00" value={kms[x.ticket_id]??""}
            onChange={e=>setKms(p=>({...p,[x.ticket_id]:e.target.value}))}/></TableCell>
        </TableRow>)}</TableBody></Table></div>:
        <p className="text-sm text-neutral-500">Prepara una liquidación para consultar los tickets foráneos.</p>}
      <div className="flex flex-wrap gap-2">
        {!active&&!!technicianCode&&<Button variant="outline" onClick={previewNow} disabled={busy}>Recalcular con kilómetros</Button>}
        {!!active&&editableKm&&<Button onClick={updateKm} disabled={busy}>Guardar kilómetros</Button>}
        {active?.estado==="CERRADO"&&canEditClosed&&<Input className="max-w-md" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo obligatorio de modificación del cierre"/>}
      </div>
    </section>

    {rows.length>0&&<section className="bg-white rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold">3. Resumen y validación</h2>
      <div className="grid sm:grid-cols-3 gap-3">{["CS_Exp","CS_Com","CS_NoPago"].map(k=><div className="rounded-lg border p-3" key={k}>
        <p className="font-semibold">{k}</p><p className="text-2xl font-bold">{totals[k]?.tickets||0}</p>
        <p className="text-sm">{formatMoney(totals[k]?.total)}</p></div>)}</div>
      {!!preview?.total_errores&&<div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm">
        <strong>{preview.total_errores} tickets con errores pendientes</strong>
        <ul className="list-disc ml-6">{preview.errores.map((e,i)=><li key={i}>{e}</li>)}</ul>
      </div>}
      <div className="overflow-auto max-h-[360px]"><Table><TableHeader><TableRow>
        {["Ticket","Técnico","Clasificación","Producto","Línea","ACT","Nivel","Origen precio","Mano de obra","Km","Total"].map(k=><TableHead key={k}>{k}</TableHead>)}
      </TableRow></TableHeader><TableBody>{rows.map(x=><TableRow key={x.ticket_id}>
        <TableCell>{x.ticket_id}</TableCell><TableCell>{x.tecnico}</TableCell><TableCell>{x.clasificacion}</TableCell>
        <TableCell>{x.producto}</TableCell><TableCell>{x.linea||"—"}</TableCell><TableCell>{x.codigo_act}</TableCell>
        <TableCell>{x.nivel||"—"}</TableCell><TableCell>{x.precio_origen||"—"}</TableCell>
        <TableCell>{formatMoney(x.mano_obra)}</TableCell><TableCell>{formatMoney(x.valor_km)}</TableCell><TableCell>{formatMoney(x.total)}</TableCell>
      </TableRow>)}</TableBody></Table></div>
      {!active&&canEdit&&<Button disabled={busy||!!preview?.total_errores} onClick={create}>Guardar borrador</Button>}
      {!!active&&editableKm&&<div className="border rounded-md p-3 space-y-2">
        <h3 className="font-semibold">Ajustar importe manualmente con auditoría</h3>
        <p className="text-xs text-neutral-500">Los cierres solo admiten ajustes de admin y coordinador. No se pueden pagar tickets CS_NoPago.</p>
        <div className="flex flex-wrap gap-2">
          <Select value={adjust.ticket_id||undefined} onValueChange={v=>setAdjust(p=>({...p,ticket_id:v}))}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Ticket"/></SelectTrigger>
            <SelectContent>{active.tickets.filter(x=>!["CS_NoPago","PENDIENTE"].includes(x.clasificacion)).map(x=><SelectItem key={x.ticket_id} value={x.ticket_id}>{x.ticket_id}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="w-32" type="number" min="0" step=".01" placeholder="USD" value={adjust.nuevo_importe} onChange={e=>setAdjust(p=>({...p,nuevo_importe:e.target.value}))}/>
          <Input className="w-64" placeholder="Motivo obligatorio" value={adjust.motivo} onChange={e=>setAdjust(p=>({...p,motivo:e.target.value}))}/>
          <Button disabled={busy||!adjust.ticket_id||!adjust.motivo||adjust.nuevo_importe===""} variant="outline" onClick={adjustPrice}>Guardar ajuste</Button>
        </div>
      </div>}
      {active&&<div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">Liquidación {active.id.slice(0,8)} · <strong>{active.estado}</strong> · Versión {active.version}</span>
        <Button variant="outline" onClick={exportFile}><FileSpreadsheet className="w-4 h-4 mr-1"/>Excel 3 hojas</Button>
        {active.estado==="BORRADOR"&&canEdit&&<Button onClick={close} disabled={busy}><Lock className="w-4 h-4 mr-1"/>Cerrar liquidación</Button>}
      </div>}
    </section>}

    <section className="bg-white rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold">Historial de liquidaciones del mes</h2>
      <div className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Técnico</TableHead><TableHead>Estado</TableHead><TableHead>Tickets</TableHead><TableHead>Versión</TableHead><TableHead>Acción</TableHead></TableRow></TableHeader>
        <TableBody>{drafts.map(x=><TableRow key={x.id}><TableCell>{x.tecnico_nombre || x.tecnico_codigo}</TableCell><TableCell>{x.estado}</TableCell><TableCell>{Object.values(x.totales||{}).reduce((a,b)=>a+(b.tickets||0),0)}</TableCell><TableCell>{x.version}</TableCell><TableCell><Button variant="outline" size="sm" onClick={()=>open(x.id)}>Abrir</Button></TableCell></TableRow>)}</TableBody></Table></div>
    </section>
  </div>;
}
