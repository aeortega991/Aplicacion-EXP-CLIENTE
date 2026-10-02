import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Receipt, LayoutDashboard, FileText, ArrowLeft, LogOut, Users, Bell, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function GastosLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const doLogout = () => { logout(); navigate("/login"); };
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    let active = true;
    const fetchCount = () => {
      api.get("/expenses/alerts")
        .then((r) => { if (active) setAlertCount(r.data.count || 0); })
        .catch(() => {});
    };
    fetchCount();
    const t = setInterval(fetchCount, 60000);
    return () => { active = false; clearInterval(t); };
  }, []);

  const navClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
    }`;

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col shrink-0" data-testid="gastos-sidebar">
        <div className="p-4 border-b border-neutral-200">
          <Link to="/" className="flex items-center gap-3 group" data-testid="back-to-hub">
            <div className="w-9 h-9 rounded-md bg-neutral-900 group-hover:bg-red-600 flex items-center justify-center text-white transition-colors">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight leading-tight">Gastos</div>
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Aprobaciones</div>
            </div>
          </Link>
          <Link to="/" className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-red-600 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Volver al hub
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavLink to="/gastos" end className={navClass} data-testid="nav-gastos-home">
            <LayoutDashboard className="w-4 h-4" /> <span>Dashboard</span>
          </NavLink>
          <NavLink to="/gastos/alertas" className={navClass} data-testid="nav-gastos-alertas">
            <Bell className="w-4 h-4" /> <span className="flex-1">Alertas</span>
            {alertCount > 0 && (
              <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-semibold" data-testid="alertas-badge">
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </NavLink>
          <NavLink to="/gastos/solicitudes" className={navClass} data-testid="nav-gastos-solicitudes">
            <FileText className="w-4 h-4" /> <span>Solicitudes</span>
          </NavLink>
          <NavLink to="/gastos/reportes" className={navClass} data-testid="nav-gastos-reportes">
            <BarChart3 className="w-4 h-4" /> <span>Reportes</span>
          </NavLink>
          {user?.role === "admin" && (
            <>
              <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-widest text-neutral-400">Administración</div>
              <NavLink to="/gastos/usuarios" className={navClass} data-testid="nav-gastos-usuarios">
                <Users className="w-4 h-4" /> <span>Usuarios</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="p-3 border-t border-neutral-200">
          <div className="px-2 pb-3">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-neutral-500 truncate">@{user?.username}</span>
              <Badge variant="secondary" className="text-[10px] uppercase">{user?.role}</Badge>
              {user?.region && <Badge variant="outline" className="text-[10px]">{user.region}</Badge>}
            </div>
            {user?.ciudad && <div className="text-[11px] text-neutral-400 mt-1">{user.ciudad}</div>}
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
