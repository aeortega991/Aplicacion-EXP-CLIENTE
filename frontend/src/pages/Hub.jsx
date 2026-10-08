import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Truck, Wrench, LogOut, ArrowRight, Receipt } from "lucide-react";

const ModuleCard = ({ to, icon: Icon, title, subtitle, tag, gradient, testId }) => (
  <Link
    to={to}
    className="group relative overflow-hidden rounded-lg border border-neutral-200 bg-white p-8 hover:border-red-600 hover:shadow-xl transition-all duration-300"
    data-testid={testId}
  >
    <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${gradient}`} />
    <div className="relative z-10">
      <div className="flex items-start justify-between mb-6">
        <div className="w-14 h-14 rounded-lg bg-neutral-900 group-hover:bg-red-600 flex items-center justify-center transition-colors">
          <Icon className="w-7 h-7 text-white" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 group-hover:text-white transition-colors">{tag}</span>
      </div>
      <h3 className="text-2xl font-bold tracking-tight mb-2 group-hover:text-white transition-colors">{title}</h3>
      <p className="text-sm text-neutral-500 group-hover:text-white/80 transition-colors leading-relaxed">{subtitle}</p>
      <div className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-red-600 group-hover:text-white transition-colors">
        Ingresar
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </div>
    </div>
  </Link>
);

export default function Hub() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-neutral-50" data-testid="hub-page">
      <header className="border-b border-neutral-200 bg-white">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/indurama-logo.jpg" alt="Indurama" className="h-9 w-auto rounded-md" />
            <div>
              <div className="text-sm font-bold tracking-tight leading-tight">SGI Experiencia al cliente</div>
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">by Indurama</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-neutral-500">@{user?.username} · {user?.role}</div>
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="gap-2">
              <LogOut className="w-4 h-4" /> Salir
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-8 py-16">
        <div className="mb-12">
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Bienvenido</div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Elige un módulo</h1>
          <p className="text-neutral-500 mt-3 max-w-xl">Selecciona el área que necesitas gestionar. Puedes cambiar entre módulos en cualquier momento.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ModuleCard
            to="/vehiculos"
            icon={Truck}
            title="Vehículos"
            subtitle="Flota, seguros, impuestos, talleres, conductores, rutas, multas, mantenimiento, alertas, mapa e historial vehicular."
            tag="8 módulos"
            gradient="bg-gradient-to-br from-red-600 to-red-800"
            testId="hub-vehicles-card"
          />
          {user?.role !== "tecnico" && (
            <ModuleCard
              to="/herramientas"
              icon={Wrench}
              title="Herramientas"
              subtitle="Inventario de herramientas, técnicos, asignación, reportes actuales e históricos y baja de activos."
              tag="6 opciones"
              gradient="bg-gradient-to-br from-neutral-800 to-neutral-950"
              testId="hub-tools-card"
            />
          )}
          <ModuleCard
            to="/gastos"
            icon={Receipt}
            title="Gastos"
            subtitle="Solicitudes de gasto con flujo de aprobación: coordinador, presupuesto (tesorero), factura y doble aprobación de gerencia."
            tag="Aprobaciones"
            gradient="bg-gradient-to-br from-[#29abe2] to-[#0033a0]"
            testId="hub-gastos-card"
          />
        </div>
      </main>
    </div>
  );
}
