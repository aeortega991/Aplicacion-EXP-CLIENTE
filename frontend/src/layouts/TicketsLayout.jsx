import { NavLink, Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Ticket, ArrowLeft, LogOut, Plus, LayoutDashboard, Columns3, List, MapPinned } from "lucide-react";
import { TicketFilters, EMPTY_FILTERS } from "@/pages/tickets/TicketFilters";
import { NewTicketDialog } from "@/pages/tickets/NewTicketDialog";

const EMPTY_DATA = { items: [], counts: {}, total: 0, sin_asignar: 0, max_mb: 25, options: { tecnicos: [], analistas: [] } };
const FILTER_PATHS = ["/tickets", "/tickets/tablero", "/tickets/listado"];

export default function TicketsLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const { data } = await api.get("/ts/tickets", { params });
      setData(data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { reload(); }, [reload]);

  const tab = ({ isActive }) =>
    `inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${
      isActive ? "bg-[#0033A0] text-white" : "text-neutral-600 hover:bg-neutral-100"
    }`;

  return (
    <div className="min-h-screen bg-neutral-50" data-testid="tickets-layout">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0 group" data-testid="ts-back-to-hub">
            <ArrowLeft className="w-4 h-4 text-neutral-400 group-hover:text-red-600" />
            <div className="w-9 h-9 rounded-md bg-[#0033A0] flex items-center justify-center text-white"><Ticket className="w-4 h-4" /></div>
            <div className="hidden sm:block">
              <div className="text-sm font-bold leading-tight">Ticket servicio</div>
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Asistencia técnica</div>
            </div>
          </Link>
          <div className="flex-1" />
          {user?.role === "tecnico" && (
            <Button size="sm" onClick={() => setOpenNew(true)} className="gap-1.5 bg-[#0033A0] hover:bg-[#002a85]" data-testid="ts-new-ticket-btn">
              <Plus className="w-4 h-4" /> Nuevo ticket
            </Button>
          )}
          <div className="hidden md:block text-right">
            <div className="text-sm font-medium leading-tight">{user?.name}</div>
            <div className="text-[11px] text-neutral-500">{user?.role}{user?.ciudad ? ` · ${user.ciudad}` : ""}</div>
          </div>
          <Button variant="outline" size="icon" onClick={() => { logout(); navigate("/login"); }} data-testid="ts-logout"><LogOut className="w-4 h-4" /></Button>
        </div>
        <nav className="max-w-7xl mx-auto px-3 sm:px-6 pb-2 flex gap-1 overflow-x-auto" data-testid="ts-nav">
          <NavLink to="/tickets" end className={tab} data-testid="ts-nav-dashboard"><LayoutDashboard className="w-4 h-4" /> Dashboard</NavLink>
          <NavLink to="/tickets/tablero" className={tab} data-testid="ts-nav-tablero"><Columns3 className="w-4 h-4" /> Tablero</NavLink>
          <NavLink to="/tickets/listado" className={tab} data-testid="ts-nav-listado"><List className="w-4 h-4" /> Listado</NavLink>
          {user?.role === "admin" && (
            <NavLink to="/tickets/ciudades" className={tab} data-testid="ts-nav-ciudades"><MapPinned className="w-4 h-4" /> Ciudades</NavLink>
          )}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-5 space-y-5">
        {FILTER_PATHS.includes(pathname) && (
          <TicketFilters filters={filters} setFilters={setFilters} options={data.options} role={user?.role} />
        )}
        <Outlet context={{ data, loading, reload }} />
      </main>
      {user?.role === "tecnico" && (
        <NewTicketDialog open={openNew} onOpenChange={setOpenNew} maxMb={data.max_mb}
          onCreated={(t) => { reload(); navigate(`/tickets/t/${t.id}`); }} />
      )}
    </div>
  );
}
