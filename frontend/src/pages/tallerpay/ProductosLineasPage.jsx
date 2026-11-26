import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api,{formatApiError} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select,SelectTrigger,SelectValue,SelectContent,SelectItem } from "@/components/ui/select";
import { Table,TableHeader,TableRow,TableHead,TableBody,TableCell } from "@/components/ui/table";
import { Save,FileUp } from "lucide-react";

export default function ProductosLineasPage(){
  const {can}=useAuth();
  const canEdit=can("tp_tarifarios","edit");
  const [lines,setLines]=useState([]),[items,setItems]=useState([]),[pending,setPending]=useState([]),[query,setQuery]=useState("");
  const [form,setForm]=useState({codigo_sap:"",descripcion:"",linea:""}),[file,setFile]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    try{const [a,b,c]=await Promise.all([api.get("/tallerpay/productos"),api.get("/tallerpay/productos/pendientes"),api.get("/tallerpay/catalogo/lineas")]);
      setItems(a.data.items);setPending(b.data.items);setLines(c.data.items.filter(x=>x.activo));
    }catch(e){toast.error(formatApiError(e))}
  },[]);
  useEffect(()=>{load()},[load]);
  const save=async(data)=>{
    setBusy(true);
    try{await api.put("/tallerpay/productos",data);toast.success("Producto vinculado");setForm({codigo_sap:"",descripcion:"",linea:""});await load();}
    catch(e){toast.error(formatApiError(e))}finally{setBusy(false)}
  };
  const upload=async()=>{
    if(!file)return;setBusy(true);
    try{let data=new FormData();data.append("file",file);
      const r=await api.post("/tallerpay/productos/import",data);setResult(r.data);
      if(r.data.confirmed){toast.success("Productos importados");setFile(null);load();}else toast.error("Corrija los errores del archivo");
    }catch(e){toast.error(formatApiError(e))}finally{setBusy(false)}
  };
  const template=async()=>{
    try{const r=await api.get("/tallerpay/productos/plantilla",{responseType:"blob"});
      const u=URL.createObjectURL(r.data),a=document.createElement("a");a.href=u;a.download="plantilla_productos_lineas.xlsx";a.click();URL.revokeObjectURL(u);
    }catch(e){toast.error(formatApiError(e))}
  };
  const chooseLine=(value,onChange)=><Select value={value||undefined} onValueChange={onChange}><SelectTrigger className="w-44"><SelectValue placeholder="Seleccionar línea"/></SelectTrigger>
    <SelectContent>{lines.map(x=><SelectItem value={x.codigo} key={x.codigo}>{x.nombre}</SelectItem>)}</SelectContent></Select>;
  return <div className="p-4 sm:p-8 space-y-6" data-testid="tallerpay-productos-lineas">
    <div><p className="text-xs uppercase tracking-widest text-neutral-500">Pago a talleres</p><h1 className="text-3xl font-bold">Productos y líneas</h1><p className="text-sm text-neutral-500">Relaciona el código SAP del producto con su línea para seleccionar el tarifario correcto. No se modifica el archivo SAP.</p></div>
    {canEdit&&<section className="rounded-lg border bg-white p-4 space-y-3"><h2 className="font-semibold">Asignar línea a un producto</h2>
      <div className="flex gap-2 flex-wrap"><Input className="w-44" value={form.codigo_sap} onChange={e=>setForm(p=>({...p,codigo_sap:e.target.value}))} placeholder="Código SAP"/>
      <Input className="w-56" value={form.descripcion} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))} placeholder="Descripción"/>
      {chooseLine(form.linea,v=>setForm(p=>({...p,linea:v})))}
      <Button disabled={!form.codigo_sap||!form.linea||busy} onClick={()=>save(form)}><Save className="w-4 h-4 mr-1"/>Guardar</Button></div>
      <div className="flex flex-wrap gap-2 items-center"><Button variant="outline" onClick={template}>Descargar plantilla</Button>
      <Input className="w-64" type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/>
      <Button disabled={!file||busy} onClick={upload}><FileUp className="w-4 h-4 mr-1"/>Importar Excel</Button></div>
      {result&&<p className="text-sm">{result.confirmed?"Importación completada":"Importación rechazada"} · {result.insertados} nuevos · {result.actualizados} actualizados · {(result.errors||[]).join("; ")}</p>}
    </section>}
    <section className="rounded-lg border bg-white p-4 space-y-3"><h2 className="font-semibold">Productos pendientes de clasificación ({pending.length})</h2>
      <div className="overflow-auto max-h-80"><Table><TableHeader><TableRow><TableHead>Código SAP</TableHead><TableHead>Producto</TableHead><TableHead>Tickets</TableHead><TableHead>Asignación</TableHead></TableRow></TableHeader><TableBody>
      {pending.map(x=><TableRow key={x.codigo_sap}><TableCell>{x.codigo_sap}</TableCell><TableCell>{x.descripcion}</TableCell><TableCell>{x.tickets}</TableCell><TableCell>{canEdit?chooseLine("",v=>save({...x,linea:v})): "Pendiente"}</TableCell></TableRow>)}
      {pending.length===0&&<TableRow><TableCell colSpan={4} className="text-center">No existen productos pendientes</TableCell></TableRow>}</TableBody></Table></div>
    </section>
    <section className="rounded-lg border bg-white p-4 space-y-3"><h2 className="font-semibold">Catálogo de productos ({items.length})</h2><Input placeholder="Buscar código o descripción" value={query} onChange={e=>setQuery(e.target.value)} className="max-w-sm"/>
      <div className="overflow-auto max-h-[420px]"><Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descripción</TableHead><TableHead>Línea</TableHead></TableRow></TableHeader><TableBody>
      {items.filter(x=>(x.codigo_sap+" "+x.descripcion).toLowerCase().includes(query.toLowerCase())).map(x=><TableRow key={x.codigo_sap}><TableCell>{x.codigo_sap}</TableCell><TableCell>{x.descripcion}</TableCell><TableCell>{canEdit?chooseLine(x.linea,v=>save({...x,linea:v})):x.linea}</TableCell></TableRow>)}
      </TableBody></Table></div></section>
  </div>
}
