import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { FileSignature, ArrowLeft, LogOut, FilePlus2, Inbox, Send, Files, LayoutDashboard } from "lucide-react";

export default function DocumentosLayout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const [pending, setPending] = useState(0);

  const refreshPending = useCallback(async () => {
    try {
      const { data } = await api.get("/docs/pendientes");
      setPending(data.count || 0);
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    refreshPending();
    const t = setInterval(refreshPending, 60000);
    return () => clearInterval(t);
  }, [refreshPending]);

  const tab = ({ isActive }) =>
    `inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${
      isActive ? "bg-[#0033A0] text-white" : "text-neutral-600 hover:bg-neutral-100"
    }`;

  return (
    <div className="min-h-screen bg-neutral-50" data-testid="docs-layout">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0 group" data-testid="docs-back-to-hub">
            <ArrowLeft className="w-4 h-4 text-neutral-400 group-hover:text-red-600" />
            <div className="w-9 h-9 rounded-md bg-[#0033A0] flex items-center justify-center text-white"><FileSignature className="w-4 h-4" /></div>
            <div>
              <div className="text-sm font-bold leading-tight">Entregas de documentos</div>
              <div className="hidden sm:block text-[10px] uppercase tracking-widest text-neutral-500">Contratos · actas · capacitaciones</div>
            </div>
          </Link>
          <div className="flex-1" />
          <div className="hidden md:block text-right">
            <div className="text-sm font-medium leading-tight">{user?.name}</div>
            <div className="text-[11px] text-neutral-500">{user?.role}{user?.ciudad ? ` · ${user.ciudad}` : ""}</div>
          </div>
          <Button variant="outline" size="icon" onClick={() => { logout(); navigate("/login"); }} data-testid="docs-logout"><LogOut className="w-4 h-4" /></Button>
        </div>
        <nav className="max-w-7xl mx-auto px-3 sm:px-6 pb-2 flex gap-1 overflow-x-auto" data-testid="docs-nav">
          {isAdmin && (
            <NavLink to="/documentos/dashboard" className={tab} data-testid="docs-nav-dashboard"><LayoutDashboard className="w-4 h-4" /> Dashboard</NavLink>
          )}
          {can("doc_nueva") && <NavLink to="/documentos/nueva" className={tab} data-testid="docs-nav-nueva"><FilePlus2 className="w-4 h-4" /> Nueva entrega</NavLink>}
          {can("doc_recibidas") && <NavLink to="/documentos/recibidas" className={tab} data-testid="docs-nav-recibidas">
            <Inbox className="w-4 h-4" /> Recibidas
            {pending > 0 && (
              <span className="ml-0.5 min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center" data-testid="docs-pending-badge">{pending}</span>
            )}
          </NavLink>}
          {can("doc_enviadas") && <NavLink to="/documentos/enviadas" className={tab} data-testid="docs-nav-enviadas"><Send className="w-4 h-4" /> Enviadas</NavLink>}
          {isAdmin && (
            <NavLink to="/documentos/todas" className={tab} data-testid="docs-nav-todas"><Files className="w-4 h-4" /> Todas</NavLink>
          )}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-5 space-y-5">
        <Outlet context={{ refreshPending }} />
      </main>
    </div>
  );
}
