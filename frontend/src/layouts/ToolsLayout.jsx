import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Wrench, Users, ClipboardCheck, FileBarChart, History, Ban, ArrowLeft, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ToolsLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const doLogout = () => { logout(); navigate("/login"); };

  const navClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? "bg-neutral-900 text-white"
        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
    }`;

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col shrink-0" data-testid="tools-sidebar">
        <div className="p-4 border-b border-neutral-200">
          <Link to="/" className="flex items-center gap-3 group" data-testid="back-to-hub">
            <div className="w-9 h-9 rounded-md bg-neutral-900 group-hover:bg-red-600 flex items-center justify-center text-white transition-colors">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight leading-tight">Herramientas</div>
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Tools Manager</div>
            </div>
          </Link>
          <Link to="/" className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-red-600 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Volver al hub
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavLink to="/herramientas" end className={navClass} data-testid="nav-tools-home">
            <LayoutDashboard className="w-4 h-4" /> <span>Inicio</span>
          </NavLink>
          <div className="pt-3 pb-1 px-3 text-[10px] uppercase tracking-widest text-neutral-400">Inventario</div>
          <NavLink to="/herramientas/inventario" className={navClass} data-testid="nav-inventario">
            <Wrench className="w-4 h-4" /> <span>Herramientas</span>
          </NavLink>
          <NavLink to="/herramientas/tecnicos" className={navClass} data-testid="nav-tecnicos">
            <Users className="w-4 h-4" /> <span>Técnicos</span>
          </NavLink>
          <div className="pt-3 pb-1 px-3 text-[10px] uppercase tracking-widest text-neutral-400">Operación</div>
          <NavLink to="/herramientas/asignaciones" className={navClass} data-testid="nav-asignaciones">
            <ClipboardCheck className="w-4 h-4" /> <span>Asignar</span>
          </NavLink>
          <NavLink to="/herramientas/reporte-actual" className={navClass} data-testid="nav-reporte-actual">
            <FileBarChart className="w-4 h-4" /> <span>Reporte actual</span>
          </NavLink>
          <NavLink to="/herramientas/reporte-historico" className={navClass} data-testid="nav-reporte-historico">
            <History className="w-4 h-4" /> <span>Histórico</span>
          </NavLink>
          <NavLink to="/herramientas/bajas" className={navClass} data-testid="nav-bajas">
            <Ban className="w-4 h-4" /> <span>Bajas</span>
          </NavLink>
        </nav>

        <div className="p-3 border-t border-neutral-200">
          <div className="px-2 pb-3">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-neutral-500 truncate">@{user?.username}</span>
              <Badge variant="secondary" className="text-[10px] uppercase">{user?.role}</Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={doLogout}>
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
