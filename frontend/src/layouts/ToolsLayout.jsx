import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Wrench, ClipboardCheck, FileBarChart, History, Ban, ArrowLeft, LogOut, LayoutDashboard, RotateCcw, ArrowRightLeft, Warehouse, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ToolsLayout() {
  const { user, logout, can } = useAuth();
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
          {can("her_dashboard") && (
            <NavLink to="/herramientas" end className={navClass} data-testid="nav-tools-home">
              <LayoutDashboard className="w-4 h-4" /> <span>Inicio</span>
            </NavLink>
          )}
          {(can("her_inventario") || can("her_bodegas")) && <div className="pt-3 pb-1 px-3 text-[10px] uppercase tracking-widest text-neutral-400">Inventario</div>}
          {can("her_inventario") && (
            <NavLink to="/herramientas/inventario" className={navClass} data-testid="nav-inventario">
              <Wrench className="w-4 h-4" /> <span>Herramientas</span>
            </NavLink>
          )}
          {can("her_bodegas") && (
            <NavLink to="/herramientas/bodegas" className={navClass} data-testid="nav-bodegas">
              <Warehouse className="w-4 h-4" /> <span>Bodegas</span>
            </NavLink>
          )}
          {(can("her_asignaciones") || can("her_devoluciones") || can("her_traspasos") || can("her_reporte_actual") || can("her_reporte_historico") || can("her_historial_tecnico") || can("her_bajas")) && <div className="pt-3 pb-1 px-3 text-[10px] uppercase tracking-widest text-neutral-400">Operación</div>}
          {can("her_asignaciones") && (
            <NavLink to="/herramientas/asignaciones" className={navClass} data-testid="nav-asignaciones">
              <ClipboardCheck className="w-4 h-4" /> <span>Asignar</span>
            </NavLink>
          )}
          {can("her_devoluciones") && (
            <NavLink to="/herramientas/devoluciones" className={navClass} data-testid="nav-devoluciones">
              <RotateCcw className="w-4 h-4" /> <span>Devoluciones</span>
            </NavLink>
          )}
          {can("her_traspasos") && (
            <NavLink to="/herramientas/traspasos" className={navClass} data-testid="nav-traspasos">
              <ArrowRightLeft className="w-4 h-4" /> <span>Traspasos</span>
            </NavLink>
          )}
          {can("her_reporte_actual") && (
            <NavLink to="/herramientas/reporte-actual" className={navClass} data-testid="nav-reporte-actual">
              <FileBarChart className="w-4 h-4" /> <span>Reporte actual</span>
            </NavLink>
          )}
          {can("her_reporte_historico") && (
            <NavLink to="/herramientas/reporte-historico" className={navClass} data-testid="nav-reporte-historico">
              <History className="w-4 h-4" /> <span>Histórico</span>
            </NavLink>
          )}
          {can("her_historial_tecnico") && (
            <NavLink to="/herramientas/historial-tecnico" className={navClass} data-testid="nav-historial-tec">
              <UserRound className="w-4 h-4" /> <span>Historial técnico</span>
            </NavLink>
          )}
          {can("her_bajas") && (
            <NavLink to="/herramientas/bajas" className={navClass} data-testid="nav-bajas">
              <Ban className="w-4 h-4" /> <span>Bajas</span>
            </NavLink>
          )}
          {user?.role === "admin" && (
            <>
              <div className="pt-3 pb-1 px-3 text-[10px] uppercase tracking-widest text-neutral-400">Administración</div>
              <NavLink to="/herramientas/usuarios" className={navClass} data-testid="nav-tools-usuarios">
                <UserRound className="w-4 h-4" /> <span>Usuarios</span>
              </NavLink>
            </>
          )}
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
