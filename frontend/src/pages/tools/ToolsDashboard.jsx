import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Wrench, Users, ClipboardCheck, Ban, DollarSign } from "lucide-react";
import { money, numberFmt } from "@/lib/api";

export default function ToolsDashboard() {
  const [stats, setStats] = useState({ tools: 0, activas: 0, inactivas: 0, technicians: 0, active_assignments: 0, valor_total: 0 });

  useEffect(() => {
    Promise.all([
      api.get("/tools/tools"),
      api.get("/tools/technicians"),
      api.get("/tools/reports/current"),
    ]).then(([t, tech, cur]) => {
      const activas = t.data.filter((x) => x.estado === "Activa").length;
      const inactivas = t.data.filter((x) => x.estado === "Inactiva").length;
      const valor = t.data.reduce((s, x) => s + Number(x.valor || 0), 0);
      setStats({
        tools: t.data.length,
        activas, inactivas,
        technicians: tech.data.length,
        active_assignments: cur.data.length,
        valor_total: valor,
      });
    }).catch(() => {});
  }, []);

  const cards = [
    { label: "Herramientas", value: numberFmt(stats.tools), icon: Wrench, color: "text-neutral-700", sub: `${stats.activas} activas · ${stats.inactivas} inactivas` },
    { label: "Técnicos", value: numberFmt(stats.technicians), icon: Users, color: "text-blue-600" },
    { label: "Asignaciones vigentes", value: numberFmt(stats.active_assignments), icon: ClipboardCheck, color: "text-emerald-600" },
    { label: "Dadas de baja", value: numberFmt(stats.inactivas), icon: Ban, color: "text-red-600" },
    { label: "Valor total", value: money(stats.valor_total), icon: DollarSign, color: "text-amber-600" },
  ];

  return (
    <div className="p-8 space-y-6" data-testid="tools-home">
      <div>
        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Módulo</div>
        <h1 className="text-3xl font-bold tracking-tight">Herramientas</h1>
        <p className="text-sm text-neutral-500 mt-1">Inventario, asignación y control de herramientas del equipo técnico.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5 border border-neutral-200 shadow-none">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-neutral-500">{c.label}</div>
                <div className="mt-2 text-3xl font-bold font-mono">{c.value}</div>
                {c.sub && <div className="text-xs text-neutral-400 mt-1">{c.sub}</div>}
              </div>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-6 border border-neutral-200 shadow-none">
        <h3 className="font-semibold mb-3">Flujo sugerido</h3>
        <ol className="space-y-2 text-sm text-neutral-600 list-decimal list-inside">
          <li><b>Registra</b> las herramientas del inventario (marca, serie, valor de compra).</li>
          <li><b>Registra</b> los técnicos que las usarán (nombre, ciudad, código).</li>
          <li><b>Asigna</b> una herramienta a un técnico. Solo se permiten herramientas <b>activas</b>.</li>
          <li>Consulta el <b>reporte actual</b> por ciudad o técnico para saber qué está entregado hoy.</li>
          <li>Usa el <b>histórico</b> para ver todas las asignaciones pasadas y devoluciones.</li>
          <li>Da de <b>baja</b> herramientas para evitar que se vuelvan a asignar.</li>
        </ol>
      </Card>
    </div>
  );
}
