import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileUp, Search, AlertTriangle, CheckCircle2 } from "lucide-react";

const FIELDS = [
  ["ticket_id", "Ticket"], ["asunto", "Asunto (columna B)"], ["clasificacion_preliminar", "Clasificación"], ["fecha_solucion", "Fecha solución"],
  ["tecnico", "Técnico"], ["tecnico_codigo", "Código técnico"],
  ["cadena", "Cadena"], ["categoria_resolucion", "Resolución"],
  ["codigo_act", "Código ACT"], ["producto_descripcion", "Producto"],
  ["ruta", "Ruta"], ["tipo_cobertura", "Cobertura"]
];

export default function ImportacionSAPPage() {
  const { can } = useAuth();
  const canEdit = can("tp_importacion", "edit");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [imports, setImports] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [period, setPeriod] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a,b] = await Promise.all([
        api.get("/tallerpay/sap/importaciones"),
        api.get("/tallerpay/sap/tickets",{params:{periodo:period,q,limit:50}})
      ]);
      setImports(a.data.items || []); setRows(b.data.items || []); setTotal(b.data.total || 0);
    } catch(err){ toast.error(formatApiError(err)); }
  }, [period,q]);
  useEffect(()=>{load()},[load]);

  const upload = async (endpoint) => {
    if (!file) return;
    setBusy(true);
    try {
      const data = new FormData(); data.append("file",file);
      const response = await api.post(endpoint,data);
      if(endpoint.endsWith("preview")){
        setPreview(response.data); setResult(null);
        if(response.data.total_errores) toast.error("Se encontraron errores de estructura");
        else toast.success("Archivo validado; revise la vista previa");
      } else {
        setResult(response.data);
        toast.success(response.data.repetido ? "Archivo importado anteriormente" : `${response.data.insertados} tickets incorporados`);
        setPreview(null); setFile(null); await load();
      }
    } catch(err) {toast.error(formatApiError(err));}
    finally {setBusy(false)}
  };

  const canCommit = canEdit && file && preview && !preview.ya_importado &&
    !preview.total_errores && preview.total_validos > 0;
  const stat = (label,value) => <div className="border rounded-lg bg-white px-4 py-3">
    <div className="text-xs text-neutral-500">{label}</div>
    <div className="text-2xl font-semibold">{value}</div>
  </div>;

  return <div className="p-4 sm:p-8 space-y-6" data-testid="tallerpay-importacion-sap">
    <div><p className="text-xs uppercase tracking-widest text-neutral-500">Pago a talleres</p>
      <h1 className="text-3xl font-bold">Importación SAP</h1>
      <p className="text-sm text-neutral-500 mt-1">Carga el XML original de SAP o el archivo Excel .xlsx convertido, con la misma validación y protección de duplicados.</p>
    </div>
    <section className="rounded-lg border bg-white p-5 space-y-4">
      <h2 className="font-semibold">1. Seleccionar archivo SAP (.xml o .xlsx)</h2>
      <p className="text-sm text-neutral-600">Ambos formatos conservan las columnas originales: asunto B, ticket C, fecha de solución I, código ACT X y técnico U/V. El archivo .xlsx debe conservar el orden de columnas de SAP. Los registros existentes no se sobrescriben.</p>
      <p className="text-sm text-amber-800">Regla de pago: si el texto de B contiene la palabra ENTREGA o un número de otro ticket, se clasifica CS_NoPago, independientemente de la promoción. El número del ticket actual se toma exclusivamente de C.</p>
      <input type="file" accept=".xml,.xlsx,text/xml,application/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Archivo SAP XML o XLSX"
        onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null);setResult(null)}}/>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!file||busy} onClick={()=>upload("/tallerpay/sap/preview")}><Search className="w-4 h-4 mr-2"/>Verificar y previsualizar</Button>
        {canEdit&&<Button disabled={!canCommit||busy} onClick={()=>upload("/tallerpay/sap/import")}><FileUp className="w-4 h-4 mr-2"/>Confirmar importación</Button>}
      </div>
      {preview&&<div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stat("Tickets válidos",preview.total_validos)}
          {stat("Errores",preview.total_errores)}
          {stat("Advertencias",preview.total_advertencias||0)}
          {stat("Facturados",preview.facturados)}
          {stat("Foráneos",preview.foraneos)}
          {stat("CS_NoPago",preview.no_pagables||0)}
          {stat("Por ENTREGA",preview.por_entrega||0)}
          {stat("Por otro ticket",preview.por_referencia_ticket||0)}
        </div>
        <p className="text-sm">Hoja: <strong>{preview.hoja}</strong> · Períodos: {Object.entries(preview.periodos||{}).map(([k,v])=>`${k}: ${v}`).join(" · ")}</p>
        <p className="text-sm">Técnicos: {(preview.tecnicos||[]).length} · Asignación a talleres: pendiente de revisión en el módulo de liquidación.</p>
        {preview.ya_importado&&<p className="text-amber-700 text-sm"><AlertTriangle className="inline w-4 h-4"/> Este archivo ya fue importado. No se duplicará.</p>}
        {(preview.total_advertencias||0)>0&&<div className="border border-amber-200 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <h3 className="font-semibold">Advertencias no bloqueantes ({preview.total_advertencias})</h3>
          <p>Los tickets se pueden importar, pero estas fechas de Inicio Prometida requieren revisión posterior.</p>
          <ul className="list-disc pl-5">{(preview.advertencias||[]).map((e,i)=><li key={i}>{e}</li>)}</ul>
        </div>}
        {preview.total_errores>0&&<div className="border border-red-200 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <h3 className="font-semibold">Errores de validación</h3>
          <ul className="list-disc pl-5">{(preview.errores||[]).map((e,i)=><li key={i}>{e}</li>)}</ul>
        </div>}
        <h3 className="font-semibold">Vista previa · primeros 20 tickets</h3>
        <div className="overflow-auto max-h-[360px]"><Table><TableHeader><TableRow>{FIELDS.map(([,name])=><TableHead key={name}>{name}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{(preview.muestra||[]).map(x=><TableRow key={x.ticket_id}>{FIELDS.map(([field])=><TableCell key={field}>{x[field]||"—"}</TableCell>)}</TableRow>)}</TableBody></Table></div>
      </div>}
      {result&&<div role="status" className="rounded-lg border p-3 text-sm"><CheckCircle2 className="inline w-4 h-4 text-green-600 mr-2"/>
        {result.insertados} insertados, {result.omitidos} ya existentes; ID importación {result.importacion_id}
      </div>}
    </section>
    <section className="rounded-lg border bg-white p-4 space-y-3">
      <h2 className="font-semibold">2. Tickets cargados en MongoDB</h2>
      <div className="flex gap-2 flex-wrap">
        <Input className="w-40" type="month" value={period} onChange={e=>setPeriod(e.target.value)} aria-label="Filtrar período"/>
        <Input className="w-52" placeholder="Buscar ticket" value={q} onChange={e=>setQ(e.target.value)}/>
        <span className="text-sm text-neutral-500 self-center">{total} registros</span>
      </div>
      <div className="overflow-auto max-h-[400px]"><Table><TableHeader><TableRow>{FIELDS.slice(0,8).map(([,name])=><TableHead key={name}>{name}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map(x=><TableRow key={x.ticket_id}>{FIELDS.slice(0,8).map(([field])=><TableCell key={field}>{x[field]||"—"}</TableCell>)}</TableRow>)}
          {rows.length===0&&<TableRow><TableCell colSpan={8} className="text-center py-8">Sin tickets importados</TableCell></TableRow>}
        </TableBody></Table></div>
      <p className="text-xs text-neutral-500">Se muestran hasta 50 registros. Los tickets se conservan sin cambios para su posterior clasificación y liquidación.</p>
    </section>
    <section className="rounded-lg border bg-white p-4 space-y-2">
      <h2 className="font-semibold">Historial de importaciones</h2>
      {imports.length?imports.map(x=><div className="text-sm border-b py-2" key={x.id}>
        {x.filename} · {x.created_at?.slice(0,10)} · {x.insertados} nuevos · {x.omitidos} omitidos · {x.created_by?.name||"Usuario"}
      </div>):<p className="text-sm text-neutral-500">No se han realizado importaciones.</p>}
    </section>
  </div>;
}
