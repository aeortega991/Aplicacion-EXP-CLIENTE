import { useCallback, useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, RefreshCw, Search, X } from "lucide-react";

const fmtMoney = v => "USD " + Number(v || 0).toLocaleString("es-EC", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const fmtDate = v => v ? String(v).replace("T", " ").slice(0, 16) : "—";
const groups = ["CS_Exp", "CS_Com", "CS_NoPago", "PENDIENTE"];

export default function HistorialPagosPage() {
  const [periodo, setPeriodo] = useState("");
  const [estado, setEstado] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [search, setSearch] = useState("");
  const [pagina, setPagina] = useState(1);
  const [data, setData] = useState({items: [], total: 0, limite: 25});
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await api.get("/tallerpay/historial/liquidaciones", {
        params: {periodo, estado, tecnico: search, pagina, limite: 25}
      });
      setData(result.data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  }, [periodo, estado, search, pagina]);

  useEffect(() => { load(); }, [load]);

  const open = async id => {
    try {
      const r = await api.get("/tallerpay/historial/liquidaciones/" + encodeURIComponent(id));
      setDetail(r.data);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const excel = async doc => {
    try {
      const r = await api.get("/tallerpay/historial/liquidaciones/" + encodeURIComponent(doc.id) + "/excel", {responseType: "blob"});
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TallerPay_${doc.tecnico_codigo}_${doc.periodo}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const pages = Math.max(1, Math.ceil(data.total / (data.limite || 25)));
  return <div className="p-4 sm:p-8 space-y-5" data-testid="tallerpay-historial">
    <div>
      <p className="text-xs tracking-widest uppercase text-neutral-500">Pago a talleres</p>
      <h1 className="text-3xl font-bold">Historial de pagos</h1>
      <p className="text-sm text-neutral-500 mt-2">Consulta histórica de liquidaciones por técnico, período y estado. No se modifican los importes desde esta pantalla.</p>
    </div>
    <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-md p-3">
      Una liquidación <strong>CERRADA</strong> no confirma que se haya realizado el pago. El registro de pagos efectivos todavía no está implementado.
    </p>
    <section className="bg-white border rounded-lg p-4 space-y-3">
      <div className="flex gap-3 flex-wrap items-end">
        <label className="text-sm space-y-1">Período <Input type="month" className="w-44" value={periodo} onChange={e => {setPeriodo(e.target.value);setPagina(1);setDetail(null);}} /></label>
        <label className="text-sm space-y-1">Estado
          <select className="block rounded-md border px-3 py-2 h-10 bg-white" value={estado} onChange={e => {setEstado(e.target.value);setPagina(1);setDetail(null);}}>
            <option value="">Todos</option><option value="BORRADOR">Borrador</option><option value="CERRADO">Cerrado</option>
          </select>
        </label>
        <form className="flex items-end gap-2" onSubmit={e => {e.preventDefault();setSearch(tecnico.trim());setPagina(1);setDetail(null);}}>
          <label className="text-sm space-y-1">Técnico (nombre o código)<Input className="w-64" placeholder="Buscar técnico" value={tecnico} onChange={e => setTecnico(e.target.value)} /></label>
          <Button type="submit" variant="outline"><Search size={16} className="mr-1"/>Buscar</Button>
        </form>
        <Button variant="outline" disabled={busy} onClick={load}><RefreshCw size={16} className="mr-1"/>Actualizar</Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-md border p-3"><p className="text-xs text-neutral-500">Liquidaciones encontradas</p><p className="text-2xl font-semibold">{data.total}</p></div>
        <div className="rounded-md border p-3"><p className="text-xs text-neutral-500">Registros en esta página</p><p className="text-2xl font-semibold">{data.items.length}</p></div>
        <div className="rounded-md border p-3"><p className="text-xs text-neutral-500">Cerradas en esta página</p><p className="text-2xl font-semibold">{data.items.filter(x => x.estado === "CERRADO").length}</p></div>
        <div className="rounded-md border p-3"><p className="text-xs text-neutral-500">Importe de esta página</p><p className="text-lg font-semibold">{fmtMoney(data.items.reduce((v,x) => v + Number(x.importe || 0), 0))}</p></div>
      </div>
      <p className="text-xs text-neutral-500">Los importes resumidos corresponden a la página visible, no al total histórico filtrado.</p>
      <div className="overflow-x-auto">
        <Table><TableHeader><TableRow>
          {["Período","Técnico","Estado","Tickets","Total liquidado","Fecha de creación","Fecha de cierre","Detalle"].map(x => <TableHead key={x}>{x}</TableHead>)}
        </TableRow></TableHeader><TableBody>
          {data.items.map(x => <TableRow key={x.id}>
            <TableCell>{x.periodo}</TableCell>
            <TableCell><div className="font-medium">{x.tecnico_nombre || x.tecnico_codigo}</div><div className="text-xs text-neutral-500">{x.tecnico_codigo}</div></TableCell>
            <TableCell>{x.estado}</TableCell><TableCell>{x.tickets}</TableCell><TableCell>{fmtMoney(x.importe)}</TableCell>
            <TableCell>{fmtDate(x.created_at)}</TableCell><TableCell>{fmtDate(x.closed_at)}</TableCell>
            <TableCell><Button size="sm" variant="outline" onClick={() => open(x.id)}>Ver detalle</Button></TableCell>
          </TableRow>)}
          {!data.items.length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-neutral-500">{busy ? "Cargando..." : "No hay liquidaciones para los filtros seleccionados"}</TableCell></TableRow>}
        </TableBody></Table>
      </div>
      <div className="flex items-center gap-3 justify-end text-sm">
        <span>Página {pagina} de {pages}</span>
        <Button size="sm" variant="outline" disabled={busy || pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
        <Button size="sm" variant="outline" disabled={busy || pagina >= pages} onClick={() => setPagina(p => p + 1)}>Siguiente</Button>
      </div>
    </section>
    {detail && <section className="bg-white border rounded-lg p-4 space-y-4" aria-label="Detalle de liquidación">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-xl font-semibold">Detalle de liquidación</h2>
          <p className="text-xs text-neutral-500">ID {detail.id} · Versión {detail.version} · {detail.estado}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => excel(detail)}><FileSpreadsheet size={16} className="mr-1"/>Descargar Excel</Button>
          <Button size="icon" variant="outline" aria-label="Cerrar detalle" onClick={() => setDetail(null)}><X size={16}/></Button>
        </div>
      </div>
      <p className="text-sm">Técnico: <strong>{detail.tecnico_nombre || detail.tecnico_codigo}</strong> · Código: {detail.tecnico_codigo} · Período: {detail.periodo} · Total: <strong>{fmtMoney(detail.importe)}</strong></p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{groups.map(k => <div className="border rounded-md p-3" key={k}>
        <p className="text-sm font-medium">{k}</p><p className="text-xs text-neutral-500">{detail.totales?.[k]?.tickets || 0} tickets</p><p className="font-semibold">{fmtMoney(detail.totales?.[k]?.total)}</p>
      </div>)}</div>
      <h3 className="font-semibold">Tickets incluidos</h3>
      <div className="overflow-auto max-h-[460px]"><Table><TableHeader><TableRow>
        {["Ticket","Fecha solución","Clasificación","Serie","Producto","Resolución","Línea","Precio origen","Mano obra","Kilometraje","Total"].map(x => <TableHead key={x}>{x}</TableHead>)}
      </TableRow></TableHeader><TableBody>{(detail.tickets || []).map(x => <TableRow key={x.ticket_id}>
        <TableCell>{x.ticket_id}</TableCell><TableCell>{x.fecha_solucion || "—"}</TableCell><TableCell>{x.clasificacion}</TableCell>
        <TableCell>{x.serie || "—"}</TableCell><TableCell>{x.producto || "—"}</TableCell><TableCell>{x.categoria_resolucion || "—"}</TableCell>
        <TableCell>{x.linea || "—"}</TableCell><TableCell>{x.precio_origen || "—"}</TableCell><TableCell>{fmtMoney(x.mano_obra)}</TableCell>
        <TableCell>{x.km == null ? "—" : `${x.km} km · ${fmtMoney(x.valor_km)}`}</TableCell><TableCell>{fmtMoney(x.total)}</TableCell>
      </TableRow>)}</TableBody></Table></div>
      <h3 className="font-semibold">Auditoría y modificaciones</h3>
      <div className="space-y-2">{(detail.historial || []).map((h,i) => <div key={i} className="border rounded-md p-3 text-sm">
        <strong>{h.accion || "Registro"}</strong> · {fmtDate(h.fecha)} · {h.usuario?.name || h.usuario?.username || "Usuario"}
        {h.ticket_id && <span> · Ticket {h.ticket_id}</span>}
        {h.motivo && <p className="text-neutral-600">Motivo: {h.motivo}</p>}
        {h.anterior !== undefined && <p className="text-neutral-600">Anterior: {h.anterior} · Nuevo: {h.nuevo}</p>}
        {h.anteriores && <p className="text-neutral-600">Km anteriores: {JSON.stringify(h.anteriores)} · Km nuevos: {JSON.stringify(h.nuevos)}</p>}
      </div>)}
      {!detail.historial?.length && <p className="text-sm text-neutral-500">Sin movimientos registrados.</p>}</div>
      {detail.closed_at && <p className="text-xs text-neutral-500">Cierre: {fmtDate(detail.closed_at)} · Usuario: {detail.closed_by?.name || detail.closed_by?.username || "—"}</p>}
    </section>}
  </div>;
}
