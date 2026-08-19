import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ShieldAlert, Wrench, FileText, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const severityStyles = {
  vencido: "bg-red-100 text-red-800 border-red-200",
  critico: "bg-red-100 text-red-800 border-red-200",
  advertencia: "bg-amber-100 text-amber-800 border-amber-200",
};

const typeIcon = { Seguro: ShieldAlert, Mantenimiento: Wrench, Impuesto: FileText };

export default function AlertsPage() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [dias, setDias] = useState("30");
  const [tipo, setTipo] = useState("todos");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get("/alerts", { params: { dias } }).then((r) => setData(r.data));
  }, [dias]);

  const sendEmails = async () => {
    setSending(true);
    try {
      const r = await api.post("/alerts/send-mnto-emails");
      toast.success(`${r.data.total_enviados} correo(s) enviado(s), ${r.data.total_omitidos} omitido(s)`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al enviar correos");
    } finally { setSending(false); }
  };

  if (!data) return <div className="p-10 text-neutral-500">Cargando alertas…</div>;

  const alerts = tipo === "todos" ? data.alertas : data.alertas.filter((a) => a.tipo.toLowerCase() === tipo);

  return (
    <div className="p-8 space-y-6" data-testid="alerts-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Panel de Alertas</div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="w-7 h-7 text-red-600" /> Alertas de Vencimiento
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Seguros, impuestos y mantenimientos que requieren atención.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-600">Horizonte</label>
            <Select value={dias} onValueChange={setDias}>
              <SelectTrigger className="w-36" data-testid="alerts-horizon"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Próximos 7 días</SelectItem>
                <SelectItem value="15">Próximos 15 días</SelectItem>
                <SelectItem value="30">Próximos 30 días</SelectItem>
                <SelectItem value="60">Próximos 60 días</SelectItem>
                <SelectItem value="90">Próximos 90 días</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-600">Tipo</label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="w-40" data-testid="alerts-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="seguro">Seguros</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                <SelectItem value="impuesto">Impuestos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <Button onClick={sendEmails} disabled={sending} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="send-emails-btn">
              <Mail className="w-4 h-4" /> {sending ? "Enviando…" : "Notificar por correo"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: data.total, icon: AlertTriangle, color: "text-red-600" },
          { label: "Seguros", value: data.por_tipo.seguros, icon: ShieldAlert, color: "text-blue-600" },
          { label: "Mantenimientos", value: data.por_tipo.mantenimiento, icon: Wrench, color: "text-amber-600" },
          { label: "Impuestos", value: data.por_tipo.impuestos, icon: FileText, color: "text-emerald-600" },
        ].map((k) => (
          <Card key={k.label} className="p-5 border border-neutral-200 shadow-none">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-neutral-500">{k.label}</div>
                <div className="mt-2 text-3xl font-bold font-mono">{k.value}</div>
              </div>
              <k.icon className={`w-6 h-6 ${k.color}`} />
            </div>
          </Card>
        ))}
      </div>

      <Card className="border border-neutral-200 shadow-none overflow-hidden">
        <div className="divide-y divide-neutral-200">
          {alerts.length === 0 ? (
            <div className="p-10 text-center text-neutral-500">No hay alertas en el rango seleccionado.</div>
          ) : (
            alerts.map((a, idx) => {
              const Icon = typeIcon[a.tipo] || AlertTriangle;
              return (
                <div key={idx} className="p-4 flex items-start gap-4 hover:bg-neutral-50" data-testid="alert-row">
                  <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${severityStyles[a.severity]}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-neutral-900 text-white font-mono">{a.placa || "—"}</Badge>
                      <span className="text-sm font-semibold">{a.tipo}</span>
                      <Badge variant="outline" className={severityStyles[a.severity]}>
                        {a.severity === "vencido" ? "Vencido" : a.severity === "critico" ? "Crítico" : "Advertencia"}
                      </Badge>
                    </div>
                    <div className="text-sm text-neutral-700 mt-1">{a.descripcion}</div>
                    <div className="text-xs text-neutral-500 mt-1 flex gap-3 font-mono">
                      {a.fecha_vencimiento && <span>Vence: {new Date(a.fecha_vencimiento).toLocaleDateString("es-EC")}</span>}
                      {a.dias_restantes !== null && a.dias_restantes !== undefined && (
                        <span>
                          {a.dias_restantes < 0 ? `Hace ${Math.abs(a.dias_restantes)} días` : `Faltan ${a.dias_restantes} días`}
                        </span>
                      )}
                      {a.km_atraso ? <span>Atraso: {a.km_atraso.toLocaleString("es-EC")} Km</span> : null}
                      {a.km_restantes ? <span>Faltan: {a.km_restantes.toLocaleString("es-EC")} Km</span> : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
