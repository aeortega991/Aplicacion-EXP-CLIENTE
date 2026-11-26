import { useEffect, useMemo, useState } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Warehouse, Search, ChevronRight, Download, ArrowLeft, Package } from "lucide-react";
import { toast } from "sonner";

function WarehouseCard({ wh, count, valor, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="text-left border border-neutral-200 rounded-md p-5 hover:border-red-500 hover:shadow-sm bg-white transition-all group"
      data-testid={`wh-card-${(wh.ciudad || "").toLowerCase()}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-11 h-11 rounded-md bg-neutral-100 group-hover:bg-red-600 group-hover:text-white flex items-center justify-center transition-colors">
          <Warehouse className="w-5 h-5" />
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-red-600" />
      </div>
      <div className="text-sm font-semibold flex items-center gap-2">
        {wh.nombre}
        {wh.es_central && <span className="text-[10px] font-semibold uppercase tracking-wider rounded bg-red-600 text-white px-1.5 py-0.5" data-testid="wh-central-badge">Ingreso</span>}
      </div>
      <div className="text-xs text-neutral-500 mt-0.5">{wh.es_central ? "Recibe todas las herramientas nuevas" : wh.ciudad}</div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold font-mono">{count}</div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">herramientas</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono">{money(valor)}</div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-500">valor</div>
        </div>
      </div>
    </button>
  );
}

export default function BodegasPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [counts, setCounts] = useState({});
  const [selected, setSelected] = useState(null);
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/tools/warehouses").then(async (r) => {
      setWarehouses(r.data);
      const map = {};
      for (const wh of r.data) {
        try {
          const t = await api.get(`/tools/warehouses/${wh.id}/tools`);
          map[wh.id] = t.data;
        } catch { map[wh.id] = []; }
      }
      setCounts(map);
    }).catch((e) => toast.error(formatApiError(e)));
  }, []);

  const openDetail = async (wh) => {
    setSelected(wh);
    setLoading(true);
    try {
      const { data } = await api.get(`/tools/warehouses/${wh.id}/tools`);
      setTools(data);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    if (!q) return tools;
    const s = q.toLowerCase();
    return tools.filter((t) => Object.values(t).some((v) => String(v || "").toLowerCase().includes(s)));
  }, [tools, q]);

  const totalValor = useMemo(() => filtered.reduce((s, t) => s + Number(t.valor || 0), 0), [filtered]);

  const downloadInventoryPdf = async () => {
    if (!selected) return;
    try {
      const pdf = await api.get(`/tools/warehouses/${selected.id}/inventory/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([pdf.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `inventario_${(selected.ciudad || "bodega").toLowerCase()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("PDF no disponible"); }
  };

  if (selected) {
    return (
      <div className="p-8 space-y-6" data-testid="tools-bodega-detail">
        <div className="flex items-start justify-between gap-4">
          <div>
            <button onClick={() => { setSelected(null); setTools([]); setQ(""); }} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-red-600 transition-colors mb-2">
              <ArrowLeft className="w-3 h-3" /> Volver a bodegas
            </button>
            <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Bodega</div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Warehouse className="w-7 h-7 text-red-600" /> {selected.nombre}
            </h1>
            <p className="text-sm text-neutral-500 mt-1">Ciudad: <b>{selected.ciudad}</b>{selected.email ? <> · Contacto: {selected.email}</> : null}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10 w-64" />
            </div>
            <Button onClick={downloadInventoryPdf} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="wh-inv-pdf-btn">
              <Download className="w-4 h-4" /> PDF Inventario
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 border border-neutral-200 shadow-none">
            <div className="text-xs uppercase tracking-widest text-neutral-500">Herramientas en bodega</div>
            <div className="text-3xl font-bold font-mono mt-1">{tools.length}</div>
          </Card>
          <Card className="p-4 border border-neutral-200 shadow-none">
            <div className="text-xs uppercase tracking-widest text-neutral-500">Valor total</div>
            <div className="text-3xl font-bold font-mono mt-1">{money(tools.reduce((s, t) => s + Number(t.valor || 0), 0))}</div>
          </Card>
          <Card className="p-4 border border-neutral-200 shadow-none">
            <div className="text-xs uppercase tracking-widest text-neutral-500">Filtradas</div>
            <div className="text-3xl font-bold font-mono mt-1">{filtered.length}</div>
            <div className="text-xs text-neutral-500 mt-1 font-mono">Valor: {money(totalValor)}</div>
          </Card>
        </div>

        <Card className="border border-neutral-200 shadow-none overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-neutral-50">
                <TableHead className="text-xs uppercase tracking-wider">ID</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Marca</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Modelo</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Serie</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">F. Compra</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">F. Ingreso</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Valor</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-neutral-500">Cargando…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-neutral-500">
                  <Package className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  Esta bodega no tiene herramientas
                </TableCell></TableRow>
              ) : filtered.map((t) => (
                <TableRow key={t.tool_id} data-testid={`bd-row-${t.tool_code}`}>
                  <TableCell className="font-mono">{t.tool_code}</TableCell>
                  <TableCell className="font-medium">{t.marca}</TableCell>
                  <TableCell>{t.modelo || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{t.serie || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{t.fecha_compra || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{t.fecha_ingreso || "—"}</TableCell>
                  <TableCell className="text-right font-mono">{money(t.valor)}</TableCell>
                  <TableCell><Badge className={t.estado === "Activa" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>{t.estado}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6" data-testid="tools-bodegas">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Bodegas</div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Warehouse className="w-7 h-7 text-red-600" /> Bodegas Internas
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Bodega Central (ingreso de herramientas nuevas) y una bodega por ciudad. Selecciona una bodega para ver su inventario y exportarlo a PDF.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {warehouses.map((wh) => {
          const items = counts[wh.id] || [];
          const valor = items.reduce((s, t) => s + Number(t.valor || 0), 0);
          return <WarehouseCard key={wh.id} wh={wh} count={items.length} valor={valor} onOpen={() => openDetail(wh)} />;
        })}
      </div>
    </div>
  );
}
