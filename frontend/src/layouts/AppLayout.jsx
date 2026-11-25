import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { MODULES } from "@/config/modules";
import {
  LayoutDashboard,
  Truck,
  ShieldCheck,
  FileText,
  Wrench,
  IdCard,
  AlertTriangle,
  Settings,
  Route,
  Map,
  BellRing,
  Car,
  Users,
  MapPinned,
  ArrowLeft,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ICONS = {
  Truck, ShieldCheck, FileText, Wrench, IdCard, AlertTriangle, Settings, Route,
};

export default function AppLayout() {
  const { user, logout, isAdmin, can } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? "bg-neutral-900 text-white"
        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
    }`;

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col shrink-0" data-testid="app-sidebar">
        <div className="p-4 border-b border-neutral-200">
          <Link to="/" className="flex items-center gap-3 group" data-testid="vehiculos-back-hub">
            <div className="w-9 h-9 rounded-md bg-red-600 flex items-center justify-center text-white">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight leading-tight">SGI Experiencia al cliente</div>
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Fleet Management</div>
            </div>
          </Link>
          <Link to="/" className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-red-600 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Volver al hub
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {can("veh_dashboard") && (
            <NavLink to="/vehiculos" end className={navClass} data-testid="nav-dashboard">
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </NavLink>
          )}
          {can("veh_alertas") && (
            <NavLink to="/vehiculos/alertas" className={navClass} data-testid="nav-alertas">
              <BellRing className="w-4 h-4" />
              <span>Alertas</span>
            </NavLink>
          )}
          {can("veh_mapa") && (
            <NavLink to="/vehiculos/mapa" className={navClass} data-testid="nav-mapa">
              <Map className="w-4 h-4" />
              <span>Mapa de Rutas</span>
            </NavLink>
          )}
          {can("veh_historial") && (
            <NavLink to="/vehiculos/historial" className={navClass} data-testid="nav-historial">
              <Car className="w-4 h-4" />
              <span>Historial Vehículo</span>
            </NavLink>
          )}
          <div className="pt-3 pb-1 px-3 text-[10px] uppercase tracking-widest text-neutral-400">
            Módulos
          </div>
          {MODULES.filter((m) => can(`veh_${m.key}`) || can(`veh_${m.key}`, "edit")).map((m) => {
            const Icon = ICONS[m.icon] || Truck;
            return (
              <NavLink key={m.key} to={`/vehiculos/${m.key}`} className={navClass} data-testid={`nav-${m.key}`}>
                <Icon className="w-4 h-4" />
                <span>{m.label}</span>
              </NavLink>
            );
          })}

          {isAdmin && (
            <>
              <div className="pt-3 pb-1 px-3 text-[10px] uppercase tracking-widest text-neutral-400">
                Administración
              </div>
              <NavLink to="/vehiculos/usuarios" className={navClass} data-testid="nav-usuarios">
                <Users className="w-4 h-4" />
                <span>Usuarios</span>
              </NavLink>
              <NavLink to="/vehiculos/ciudades" className={navClass} data-testid="nav-ciudades">
                <MapPinned className="w-4 h-4" />
                <span>Ciudades</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="p-3 border-t border-neutral-200">
          <div className="px-2 pb-3">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-neutral-500 truncate">@{user?.username}</span>
              <Badge variant="secondary" className="text-[10px] uppercase" data-testid="user-role-badge">
                {user?.role}
              </Badge>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleLogout}
            data-testid="logout-button"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
