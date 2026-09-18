import { useEffect, useMemo, useState } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRightLeft, Download, Warehouse } from "lucide-react";
import { toast } from "sonner";

export default function TraspasosPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [notas, setNotas] = useState("");
  const [tools, setTools] = useState([]);
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);

  const loadAll = async () => {
    const [w, h] = await Promise.all([
      api.get("/tools/warehouses"),
      api.get("/tools/transfers"),
    ]);
    setWarehouses(w.data);
    setHistory(h.data);
  };
  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!fromId) { setTools([]); setSelected([]); return; }
    api.get(`/tools/warehouses/${fromId}/tools`)
      .then((r) => { setTools(r.data); setSelected([]); })
      .catch((e) => toast.error(formatApiError(e)));
  }, [fromId]);

  const from = warehouses.find((w) => w.id === fromId);
  const to = warehouses.find((w) => w.id === toId);
  const valorSel = useMemo(
    () => tools.filter((t) => selected.includes(t.tool_id)).reduce((s, t) => s + Number(t.valor || 0), 0),
    [tools, selected]
  );

  const toggle = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleAll = () => {
    if (selected.length === tools.length) setSelected([]);
    else setSelected(tools.map((t) => t.tool_id));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!fromId || !toId) { toast.error("Selecciona bodega origen y destino"); return; }
    if (fromId === toId) { toast.error("Origen y destino deben ser diferentes"); return; }
    if (selected.length === 0) { toast.error("Selecciona al menos una herramienta"); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post("/tools/transfers", {
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        tool_ids: selected,
        notas: notas || null,
      });
      const pdf = await api.get(`/tools/transfers/${data.batch_id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([pdf.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `traspaso_${data.batch_id.slice(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      const enviados = data.emails_enviados.length;
      const omitidos = data.emails_omitidos.length;
      toast.success(
        `${data.total_herramientas} herramientas trasladadas · ${data.from_warehouse.ciudad} → ${data.to_warehouse.ciudad} · PDF descargado · ${enviados} correo(s)${omitidos ? ` · ${omitidos} omitido(s)` : ""}`
      );
      setSelected([]); setNotas("");
      loadAll();
      if (fromId) {
        const r = await api.get(`/tools/warehouses/${fromId}/tools`);
        setTools(r.data);
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setSubmitting(false); }
  };

  const downloadTransferPdf = async (batch_id) => {
    try {
      const pdf = await api.get(`/tools/transfers/${batch_id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([pdf.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `traspaso_${batch_id.slice(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("PDF no disponible"); }
  };

  return (
    <div className="p-8 space-y-6" data-testid="tools-traspasos">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Operación</div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ArrowRightLeft className="w-7 h-7 text-red-600" /> Traspasos entre Bodegas
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Transfiere herramientas desde una bodega de una ciudad a la bodega de otra. Se genera un acta PDF y se notifica al responsable y a las bodegas.
        </p>
      </div>

      <Card className="p-6 border border-neutral-200 shadow-none">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label>Bodega ORIGEN *</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger data-testid="trs-from-select"><SelectValue placeholder="Seleccionar bodega origen…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.nombre} · {w.ciudad}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bodega DESTINO *</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger data-testid="trs-to-select"><SelectValue placeholder="Seleccionar bodega destino…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {warehouses.filter((w) => w.id !== fromId).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.nombre} · {w.ciudad}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest text-neutral-500">A trasladar</div>
              <div className="text-3xl font-bold font-mono">{selected.length}</div>
              <div className="text-xs text-neutral-500 font-mono">Valor: {money(valorSel)}</div>
            </div>
          </div>

          {from && to && from.id !== to.id && (
            <div className="flex items-center gap-2 text-sm text-neutral-600 bg-blue-50 border border-blue-100 rounded-md px-3 py-2">
              <Warehouse className="w-4 h-4 text-blue-600" />
              <span><b>{from.ciudad}</b></span>
              <ArrowRightLeft className="w-4 h-4 text-blue-600" />
              <span><b>{to.ciudad}</b></span>
            </div>
          )}

          {fromId && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Herramientas en bodega origen ({tools.length})</Label>
                <button type="button" onClick={toggleAll} className="text-xs text-red-600 hover:text-red-700 font-medium">
                  {selected.length === tools.length && tools.length > 0 ? "Deseleccionar todo" : "Seleccionar todo"}
                </button>
              </div>
              <div className="border border-neutral-200 rounded-md max-h-72 overflow-y-auto">
                {tools.length === 0 ? (
                  <div className="p-8 text-center text-sm text-neutral-500">La bodega origen no tiene herramientas disponibles para traspaso</div>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {tools.map((t) => (
                      <label key={t.tool_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 cursor-pointer" data-testid={`trs-check-${t.tool_code}`}>
                        <Checkbox checked={selected.includes(t.tool_id)} onCheckedChange={() => toggle(t.tool_id)} />
                        <span className="font-mono text-sm w-20 shrink-0">{t.tool_code}</span>
                        <span className="text-sm flex-1"><b>{t.marca}</b> {t.modelo || ""} · <span className="text-neutral-500">{t.serie || "sin serie"}</span></span>
                        <span className="text-xs text-neutral-500 font-mono">Ingreso: {t.fecha_ingreso}</span>
                        <span className="font-mono text-sm w-24 text-right">{money(t.valor)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Motivo del traspaso, referencia, etc." />
          </div>

          <div className="flex items-center justify-end">
            <Button type="submit" disabled={submitting || !fromId || !toId} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="trs-submit-btn">
              <ArrowRightLeft className="w-4 h-4" />
              {submitting ? "Procesando…" : `Trasladar ${selected.length || ""} y generar acta`}
            </Button>
          </div>
        </form>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-3">Traspasos recientes ({history.length})</h2>
        <Card className="border border-neutral-200 shadow-none overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-neutral-50">
                <TableHead className="text-xs uppercase tracking-wider">Fecha</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Origen</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Destino</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Herramientas</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Notas</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Acta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-neutral-500">Sin traspasos registrados</TableCell></TableRow>
              ) : history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-xs">{h.fecha}</TableCell>
                  <TableCell><Badge variant="secondary">{h.from_ciudad}</Badge></TableCell>
                  <TableCell><Badge variant="secondary">{h.to_ciudad}</Badge></TableCell>
                  <TableCell className="font-mono">{(h.tool_ids || []).length}</TableCell>
                  <TableCell className="text-sm text-neutral-600 max-w-xs truncate">{h.notas || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => downloadTransferPdf(h.id)}>
                      <Download className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
