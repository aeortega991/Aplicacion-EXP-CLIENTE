import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, Store, Tags, ListChecks, BadgePercent, FileUp, Calculator, History, ArrowLeft } from "lucide-react";

const SECTIONS = [
  { path: "", key: "tp_dashboard", name: "Dashboard", icon: LayoutDashboard, end: true },
  { path: "talleres", key: "tp_talleres", name: "Talleres tercerizados", icon: Store },
  { path: "tarifarios", key: "tp_tarifarios", name: "Tarifarios", icon: Tags },
  { path: "codificador", key: "tp_codificador", name: "Codificador ACT", icon: ListChecks },
  { path: "promociones", key: "tp_promociones", name: "Promociones comerciales", icon: BadgePercent },
  { path: "importacion", key: "tp_importacion", name: "Importación SAP", icon: FileUp },
  { path: "liquidaciones", key: "tp_liquidaciones", name: "Liquidaciones", icon: Calculator },
  { path: "historial", key: "tp_historial", name: "Historial de pagos", icon: History },
];

/** Navegación aislada del módulo; utiliza los permisos existentes de EXP Cliente. */
export default function TallerPayLayout() {
  const { user, can } = useAuth();
  return (
    <div className="min-h-screen bg-neutral-50 flex">
      <aside className="w-64 shrink-0 bg-white border-r border-neutral-200 flex flex-col">
        <header className="p-5 border-b">
          <Link to="/" className="text-xs text-neutral-500 hover:text-red-600 flex items-center gap-2">
            <ArrowLeft size={14} /> Volver al inicio
          </Link>
          <h1 className="font-bold text-lg mt-4">Pago a talleres</h1>
          <p className="text-xs text-neutral-500">Talleres tercerizados</p>
        </header>
        <nav className="flex-1 p-3 space-y-1" aria-label="Menú Pago a talleres">
          {SECTIONS.filter((item) => can(item.key)).map(({ path, name, icon: Icon, end }) => (
            <NavLink
              key={path || "dashboard"}
              to={path ? `/pago-talleres/${path}` : "/pago-talleres"}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${isActive ? "bg-neutral-900 text-white" : "hover:bg-neutral-100 text-neutral-700"}`
              }
            >
              <Icon className="w-4 h-4" /> {name}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t text-xs text-neutral-500">{user?.name}</div>
      </aside>
      <main className="flex-1 min-w-0"><Outlet /></main>
    </div>
  );
}
