import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/SearchSelect";
import { AlertTriangle, Plus, X, Users, Loader2, FilePlus2, Lock } from "lucide-react";
import { TIPOS } from "./shared";

const EMPTY = { tipo: "", receptor_id: "", documento_url: "", tema: "", capacitador: "", lugar: "" };
const isUrl = (u) => {
  try {
    const x = new URL((u || "").trim());
    return ["http:", "https:"].includes(x.protocol) && !!x.hostname && !/\s/.test(u.trim());
  } catch {
    return false;
  }
};

const ReadOnly = ({ label, value, testId }) => (
  <div className="space-y-1.5">
    <Label className="text-xs text-neutral-500 flex items-center gap-1"><Lock className="w-3 h-3" /> {label}</Label>
    <div className="h-10 px-3 rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-sm flex items-center text-neutral-700 truncate" data-testid={testId}>{value}</div>
  </div>
);

export default function NuevaEntrega() {
  const navigate = useNavigate();
  const { refreshPending } = useOutletContext() || {};
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [participantes, setParticipantes] = useState([]);
  const [nuevoPart, setNuevoPart] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    api.get("/docs/meta").then(({ data }) => setMeta(data)).catch((e) => toast.error(formatApiError(e)));
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const esCap = form.tipo === "Capacitación";

  const addParticipante = () => {
    const n = nuevoPart.trim().replace(/\s+/g, " ");
    if (!n) return;
    setParticipantes((p) => [...p, n]);
    setNuevoPart("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.tipo) return toast.error("Selecciona el tipo de documento");
    if (!form.receptor_id) return toast.error("Selecciona el usuario que recibe");
    if (!isUrl(form.documento_url)) return toast.error("Ingresa una URL válida que empiece con http:// o https://");
    if (esCap) {
      if (!form.tema.trim() || !form.capacitador.trim() || !form.lugar.trim()) return toast.error("Completa tema, capacitador y lugar de la capacitación");
      if (participantes.length === 0) return toast.error("Agrega al menos un participante");
    }
    setSaving(true);
    try {
      const payload = { tipo: form.tipo, receptor_id: form.receptor_id, documento_url: form.documento_url.trim() };
      if (esCap) Object.assign(payload, { tema: form.tema, capacitador: form.capacitador, lugar: form.lugar, participantes });
      const { data } = await api.post("/docs/entregas", payload);
      toast.success(`Entrega ${data.codigo} registrada`, { description: `Pendiente de recepción por ${data.receptor_nombre}` });
      refreshPending?.();
      navigate("/documentos/enviadas");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!meta) return <div className="p-10 text-sm text-neutral-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>;

  const userOptions = meta.usuarios.map((u) => ({
    value: u.id,
    label: `${u.name || u.username} · ${u.username}${u.ciudad ? ` · ${u.ciudad}` : ""}`,
  }));
  const blocked = !meta.puede_registrar;

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto" data-testid="docs-new-form">
      <div className="mb-5">
        <div className="text-xs uppercase tracking-widest text-neutral-500">Registro</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Nueva entrega</h1>
        <p className="text-sm text-neutral-500 mt-1">Se generará un código único (CD-AAAA-000001) y quedará <b>Pendiente de recepción</b> hasta que el receptor la acepte.</p>
      </div>

      {blocked && (
        <div className="mb-5 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="docs-no-city-alert">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
          <div>
            <div className="font-semibold">No puedes registrar entregas todavía</div>
            <div>Tu usuario no tiene una ciudad asignada y la entrega debe guardar la ciudad del emisor. Pide al administrador que te asigne una ciudad en Usuarios.</div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white p-5 sm:p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tipo de documento *</Label>
            <Select value={form.tipo} onValueChange={(v) => set("tipo", v)} disabled={blocked}>
              <SelectTrigger data-testid="docs-tipo-select"><SelectValue placeholder="Seleccionar tipo…" /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => <SelectItem key={t} value={t} data-testid={`docs-tipo-${t}`}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <ReadOnly label="Usuario que entrega" value={meta.emisor.name} testId="docs-emisor" />
          <ReadOnly label="Ciudad" value={meta.emisor.ciudad || "Sin ciudad asignada"} testId="docs-ciudad" />
          <div className="space-y-1.5">
            <Label>Usuario que recibe *</Label>
            <SearchSelect value={form.receptor_id} onChange={(v) => set("receptor_id", v)} options={userOptions}
              placeholder="Buscar usuario…" disabled={blocked} testId="docs-receptor-select" emptyText="Ningún usuario coincide" />
          </div>
          <ReadOnly label="Fecha y hora" value={`${now.toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" })} (automática)`} testId="docs-fecha" />
          <div className="space-y-1.5 sm:col-span-2">
            <Label>URL del documento escaneado *</Label>
            <Input type="url" placeholder="https://…" value={form.documento_url} onChange={(e) => set("documento_url", e.target.value)}
              disabled={blocked} data-testid="docs-url-input" />
            <p className="text-[11px] text-neutral-500">Solo se guarda el enlace al documento original (no el archivo).</p>
          </div>
        </div>

        {esCap && (
          <div className="rounded-lg border border-[#0033A0]/20 bg-[#0033A0]/[0.03] p-4 space-y-4" data-testid="docs-cap-section">
            <div className="text-sm font-semibold text-[#0033A0]">Datos de la capacitación</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Tema de capacitación *</Label>
                <Input value={form.tema} onChange={(e) => set("tema", e.target.value)} data-testid="docs-cap-tema" />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre del capacitador *</Label>
                <Input value={form.capacitador} onChange={(e) => set("capacitador", e.target.value)} data-testid="docs-cap-capacitador" />
              </div>
              <div className="space-y-1.5">
                <Label>Lugar de capacitación *</Label>
                <Input value={form.lugar} onChange={(e) => set("lugar", e.target.value)} data-testid="docs-cap-lugar" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Participantes *</Label>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-600" data-testid="docs-cap-count">
                  <Users className="w-3.5 h-3.5" /> {participantes.length} participante{participantes.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex gap-2">
                <Input placeholder="Nombre del participante" value={nuevoPart} onChange={(e) => setNuevoPart(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addParticipante(); } }} data-testid="docs-cap-part-input" />
                <Button type="button" variant="outline" onClick={addParticipante} className="gap-1 shrink-0" data-testid="docs-cap-part-add"><Plus className="w-4 h-4" /> Agregar</Button>
              </div>
              {participantes.length > 0 ? (
                <ol className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white max-h-64 overflow-y-auto" data-testid="docs-cap-part-list">
                  {participantes.map((p, i) => (
                    <li key={`${p}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm" data-testid="docs-cap-part-item">
                      <span className="w-6 text-right text-xs text-neutral-400">{i + 1}.</span>
                      <span className="flex-1 truncate">{p}</span>
                      <button type="button" onClick={() => setParticipantes((arr) => arr.filter((_, j) => j !== i))}
                        className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50" aria-label="Eliminar" data-testid="docs-cap-part-remove">
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="text-xs text-neutral-500 border border-dashed border-neutral-300 rounded-md p-3 text-center">Aún no hay participantes. No necesitan tener cuenta en la aplicación.</div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => navigate("/documentos/enviadas")}>Cancelar</Button>
          <Button type="submit" disabled={blocked || saving} className="gap-2 bg-[#0033A0] hover:bg-[#002a85]" data-testid="docs-submit-btn">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />} Registrar entrega
          </Button>
        </div>
      </div>
    </form>
  );
}
