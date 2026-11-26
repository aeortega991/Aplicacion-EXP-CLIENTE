import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Download, Eye, FilePlus2, Loader2, Search, Inbox } from "lucide-react";
import { EstadoBadge, PENDIENTE, RECIBIDO, TIPOS, downloadActa, fmtDateTime } from "./shared";
import EntregaDetailDialog, { AcceptConfirm } from "./EntregaDetailDialog";

const TITLES = {
  recibidas: { t: "Entregas recibidas", s: "Documentos dirigidos a tu cuenta. Acepta las pendientes para confirmar la recepción." },
  enviadas: { t: "Entregas enviadas", s: "Documentos que registraste y su estado de recepción." },
  todas: { t: "Todas las entregas", s: "Vista general de administrador de todas las entregas registradas." },
};
const ALL = "__all";

export default function EntregasList({ scope }) {
  const { user } = useAuth();
  const { refreshPending } = useOutletContext() || {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState(ALL);
  const [estado, setEstado] = useState(ALL);
  const [ciudad, setCiudad] = useState(ALL);
  const [detail, setDetail] = useState(null);
  const [toAccept, setToAccept] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/docs/entregas", { params: { scope } });
      setItems(data.items);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { load(); setQ(""); setTipo(ALL); setEstado(ALL); setCiudad(ALL); }, [load]);

  const ciudades = useMemo(() => [...new Set(items.map((d) => d.ciudad).filter(Boolean))].sort(), [items]);
  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return items.filter((d) =>
      (tipo === ALL || d.tipo === tipo) && (estado === ALL || d.estado === estado) && (ciudad === ALL || d.ciudad === ciudad) &&
      (!ql || [d.codigo, d.tipo, d.emisor_nombre, d.receptor_nombre, d.ciudad].join(" ").toLowerCase().includes(ql)));
  }, [items, q, tipo, estado, ciudad]);

  const onChanged = (upd) => {
    setItems((arr) => arr.map((x) => (x.id === upd.id ? upd : x)));
    setDetail((d) => (d && d.id === upd.id ? upd : d));
    refreshPending?.();
  };

  const pendCount = items.filter((d) => d.estado === PENDIENTE).length;
  const title = TITLES[scope];

  return (
    <div className="space-y-4" data-testid={`docs-list-${scope}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title.t}</h1>
          <p className="text-sm text-neutral-500">{title.s}</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-md bg-white border border-neutral-200 px-3 py-1.5"><b data-testid="docs-list-total">{items.length}</b> en total</span>
          <span className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5"><b>{pendCount}</b> pendientes</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border border-neutral-200 bg-white p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código, usuario, ciudad…" className="pl-9" data-testid="docs-search" />
        </div>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-[170px]" data-testid="docs-filter-tipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-[200px]" data-testid="docs-filter-estado"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            <SelectItem value={PENDIENTE}>{PENDIENTE}</SelectItem>
            <SelectItem value={RECIBIDO}>{RECIBIDO}</SelectItem>
          </SelectContent>
        </Select>
        {scope === "todas" && (
          <Select value={ciudad} onValueChange={setCiudad}>
            <SelectTrigger className="w-[170px]" data-testid="docs-filter-ciudad"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las ciudades</SelectItem>
              {ciudades.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-x-auto">
        {loading ? (
          <div className="p-10 text-sm text-neutral-500 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center" data-testid="docs-empty">
            <Inbox className="w-10 h-10 mx-auto text-neutral-300" />
            <div className="mt-2 text-sm text-neutral-500">{items.length ? "Ninguna entrega coincide con los filtros." : "Aún no hay entregas aquí."}</div>
            {scope === "enviadas" && !items.length && (
              <Button asChild size="sm" className="mt-4 gap-1.5 bg-[#0033A0] hover:bg-[#002a85]"><Link to="/documentos/nueva"><FilePlus2 className="w-4 h-4" /> Nueva entrega</Link></Button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Código</th>
                <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                {scope !== "recibidas" && <th className="text-left px-4 py-3 font-semibold">{scope === "todas" ? "Entrega" : "Recibe"}</th>}
                {scope === "todas" && <th className="text-left px-4 py-3 font-semibold">Recibe</th>}
                {scope === "recibidas" && <th className="text-left px-4 py-3 font-semibold">Entrega</th>}
                <th className="text-left px-4 py-3 font-semibold">Ciudad</th>
                <th className="text-left px-4 py-3 font-semibold">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold">Estado</th>
                <th className="text-right px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((d) => {
                const canAccept = d.receptor_id === user?.id && d.estado === PENDIENTE;
                return (
                  <tr key={d.id} className="hover:bg-neutral-50" data-testid="docs-row">
                    <td className="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap" data-testid="docs-row-codigo">{d.codigo}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{d.tipo}</td>
                    {scope !== "recibidas" && <td className="px-4 py-3">{scope === "todas" ? d.emisor_nombre : d.receptor_nombre}</td>}
                    {scope === "todas" && <td className="px-4 py-3">{d.receptor_nombre}</td>}
                    {scope === "recibidas" && <td className="px-4 py-3">{d.emisor_nombre}</td>}
                    <td className="px-4 py-3 whitespace-nowrap">{d.ciudad}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-neutral-600">{fmtDateTime(d.created_at)}</td>
                    <td className="px-4 py-3"><EstadoBadge estado={d.estado} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canAccept && (
                          <Button size="sm" className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setToAccept(d)} data-testid="docs-row-accept">
                            <CheckCircle2 className="w-4 h-4" /> Aceptar
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Ver detalle" onClick={() => setDetail(d)} data-testid="docs-row-view"><Eye className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Descargar acta" onClick={() => downloadActa(d)} data-testid="docs-row-acta"><Download className="w-4 h-4" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <EntregaDetailDialog entrega={detail} onOpenChange={(o) => !o && setDetail(null)} onChanged={onChanged} />
      {toAccept && <AcceptConfirm entrega={toAccept} open={!!toAccept} onOpenChange={(o) => !o && setToAccept(null)} onAccepted={onChanged} />}
    </div>
  );
}
