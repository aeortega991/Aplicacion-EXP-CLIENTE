import { useEffect, useMemo, useState } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCcw, Download, Warehouse } from "lucide-react";
import { toast } from "sonner";

export default function DevolucionesPage() {
  const { can } = useAuth();
  const [technicians, setTechnicians] = useState([]);
  const [cities, setCities] = useState([]);
  const [ciudadFilter, setCiudadFilter] = useState("__all__");
  const [current, setCurrent] = useState([]);
  const [techId, setTechId] = useState("");
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [tech, cur, ci] = await Promise.all([
      api.get("/tools/technicians"),
      api.get("/tools/reports/current"),
      api.get("/cities"),
    ]);
    setTechnicians(tech.data);
    setCurrent(cur.data);
    setCities(ci.data.cities || []);
  };
  useEffect(() => { load(); }, []);

  const tech = technicians.find((t) => t.id === techId);
  const techsWithAssignments = useMemo(() => {
    const ids = new Set(current.map((c) => c.technician_id));
    let list = technicians.filter((t) => ids.has(t.id));
    if (ciudadFilter !== "__all__") {
      list = list.filter((t) => String(t.ciudad || "").toUpperCase() === ciudadFilter.toUpperCase());
    }
    return list;
  }, [technicians, current, ciudadFilter]);

  // Reset tech when city filter would hide them
  useEffect(() => {
    if (tech && ciudadFilter !== "__all__" && String(tech.ciudad || "").toUpperCase() !== ciudadFilter.toUpperCase()) {
      setTechId(""); setSelected([]);
    }
  }, [ciudadFilter]); // eslint-disable-line

  const assigned = useMemo(() => current.filter((c) => c.technician_id === techId), [current, techId]);
  const valorSel = useMemo(
    () => assigned.filter((a) => selected.includes(a.id)).reduce((s, a) => s + Number(a.tool_valor || 0), 0),
    [assigned, selected]
  );

  const toggle = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleAll = () => {
    if (selected.length === assigned.length) setSelected([]);
    else setSelected(assigned.map((a) => a.id));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!techId) { toast.error("Selecciona un técnico"); return; }
    if (selected.length === 0) { toast.error("Selecciona al menos una herramienta a devolver"); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post("/tools/returns", { technician_id: techId, assignment_ids: selected });
      const pdf = await api.get(`/tools/returns/${data.batch_id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([pdf.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `devolucion_${data.batch_id.slice(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      const enviados = data.emails_enviados.length;
      const omitidos = data.emails_omitidos.length;
      toast.success(
        `${data.total_herramientas} herramientas devueltas a ${data.warehouse_nombre} · PDF descargado · ${enviados} correo(s) enviado(s)${omitidos ? ` · ${omitidos} omitido(s)` : ""}`
      );
      setTechId(""); setSelected([]);
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="p-8 space-y-6" data-testid="tools-devoluciones">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Operación</div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <RotateCcw className="w-7 h-7 text-red-600" /> Devolución de Herramientas
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Selecciona un técnico, elige las herramientas a devolver y confirma. Las herramientas ingresarán a la bodega de la ciudad del técnico. Se genera un acta PDF y se notifica al técnico y a la bodega.
        </p>
      </div>

      <Card className="p-6 border border-neutral-200 shadow-none">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label>Filtrar por ciudad</Label>
              <Select value={ciudadFilter} onValueChange={setCiudadFilter}>
                <SelectTrigger data-testid="dev-ciudad-filter"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__all__">— Todas las ciudades —</SelectItem>
                  {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Técnico * {ciudadFilter !== "__all__" && <span className="text-xs text-neutral-500 font-normal">({techsWithAssignments.length} en {ciudadFilter})</span>}</Label>
              <Select value={techId} onValueChange={(v) => { setTechId(v); setSelected([]); }}>
                <SelectTrigger data-testid="ret-tech-select">
                  <SelectValue placeholder={techsWithAssignments.length === 0 ? "Sin técnicos con asignaciones en esta ciudad" : "Seleccionar técnico…"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {techsWithAssignments.length === 0 && (
                    <SelectItem value="__none__" disabled>Sin técnicos con asignaciones vigentes</SelectItem>
                  )}
                  {techsWithAssignments.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.codigo} — {t.nombre} {t.apellido} · {t.ciudad || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tech && (
                <div className="text-xs text-neutral-600 mt-2 flex flex-wrap gap-4 items-center">
                  <span className="flex items-center gap-1 text-emerald-700">
                    <Warehouse className="w-3 h-3" /> Bodega destino: <b>Bodega {tech.ciudad}</b>
                  </span>
                  {!tech.ciudad && <span className="text-amber-700">⚠ El técnico no tiene ciudad asignada</span>}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest text-neutral-500">A devolver</div>
              <div className="text-3xl font-bold font-mono">{selected.length}</div>
              <div className="text-xs text-neutral-500 font-mono">Valor: {money(valorSel)}</div>
            </div>
          </div>

          {tech && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Herramientas asignadas ({assigned.length})</Label>
                <button type="button" onClick={toggleAll} className="text-xs text-red-600 hover:text-red-700 font-medium">
                  {selected.length === assigned.length && assigned.length > 0 ? "Deseleccionar todo" : "Seleccionar todo"}
                </button>
              </div>
              <div className="border border-neutral-200 rounded-md max-h-72 overflow-y-auto">
                {assigned.length === 0 ? (
                  <div className="p-8 text-center text-sm text-neutral-500">Este técnico no tiene herramientas asignadas</div>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {assigned.map((a) => (
                      <label key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 cursor-pointer" data-testid={`ret-check-${a.tool_code}`}>
                        <Checkbox checked={selected.includes(a.id)} onCheckedChange={() => toggle(a.id)} />
                        <span className="font-mono text-sm w-20 shrink-0">{a.tool_code}</span>
                        <span className="text-sm flex-1"><b>{a.tool_marca}</b> {a.tool_modelo || ""} · <span className="text-neutral-500">{a.tool_serie || "sin serie"}</span></span>
                        <span className="text-xs text-neutral-500 font-mono">Asignada: {a.fecha_asignacion}</span>
                        <span className="font-mono text-sm w-24 text-right">{money(a.tool_valor)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end">
            {can("her_devoluciones", "edit") && (
            <Button type="submit" disabled={submitting || !tech} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="return-batch-btn">
              <RotateCcw className="w-4 h-4" />
              {submitting ? "Procesando…" : `Devolver ${selected.length || ""} a bodega`}
            </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
