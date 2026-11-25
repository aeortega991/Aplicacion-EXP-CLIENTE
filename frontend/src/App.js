import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import SsoCallback from "@/pages/SsoCallback";
import Hub from "@/pages/Hub";
import AppLayout from "@/layouts/AppLayout";
import ToolsLayout from "@/layouts/ToolsLayout";
import Dashboard from "@/pages/Dashboard";
import ModulePage from "@/pages/ModulePage";
import UsersPage from "@/pages/UsersPage";
import AlertsPage from "@/pages/AlertsPage";
import RutasMap from "@/pages/RutasMap";
import VehicleHistory from "@/pages/VehicleHistory";
import ToolsDashboard from "@/pages/tools/ToolsDashboard";
import HerramientasPage from "@/pages/tools/HerramientasPage";
import AsignacionesPage from "@/pages/tools/AsignacionesPage";
import DevolucionesPage from "@/pages/tools/DevolucionesPage";
import TraspasosPage from "@/pages/tools/TraspasosPage";
import BodegasPage from "@/pages/tools/BodegasPage";
import HistorialTecnicoPage from "@/pages/tools/HistorialTecnicoPage";
import { ReporteActual, ReporteHistorico } from "@/pages/tools/ReportesPage";
import BajasPage from "@/pages/tools/BajasPage";
import GastosLayout from "@/layouts/GastosLayout";
import GastosDashboard from "@/pages/gastos/GastosDashboard";
import SolicitudesPage from "@/pages/gastos/SolicitudesPage";
import GastosAlertas from "@/pages/gastos/GastosAlertas";
import GastosReportes from "@/pages/gastos/GastosReportes";
import CuentasPage from "@/pages/gastos/CuentasPage";
import PermissionsPage from "@/pages/PermissionsPage";
import TicketsLayout from "@/layouts/TicketsLayout";
import TicketsDashboard from "@/pages/tickets/TicketsDashboard";
import TicketsBoard from "@/pages/tickets/TicketsBoard";
import TicketsList from "@/pages/tickets/TicketsList";
import TicketDetail from "@/pages/tickets/TicketDetail";
import CiudadesPage from "@/pages/CiudadesPage";
import { MODULES } from "@/config/modules";
import "@/index.css";

const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 text-sm text-muted-foreground">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const AdminOnly = ({ children }) => {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return children;
};

const RequireAccess = ({ resource, children }) => {
  const { can, loading } = useAuth();
  if (loading) return <div className="p-10 text-sm text-muted-foreground">Cargando…</div>;
  if (!can(resource, "view")) return <Navigate to="/" replace />;
  return children;
};

const TS_ROLES = ["tecnico", "analista_tecnico", "admin"];
const RequireTicketRole = ({ children }) => {
  const { user } = useAuth();
  if (!TS_ROLES.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/sso/callback" element={<SsoCallback />} />
          <Route path="/" element={<Protected><Hub /></Protected>} />
          <Route path="/permisos" element={<Protected><AdminOnly><PermissionsPage /></AdminOnly></Protected>} />
          <Route path="/vehiculos" element={<Protected><RequireAccess resource="vehiculos"><AppLayout /></RequireAccess></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="alertas" element={<AlertsPage />} />
            <Route path="mapa" element={<RutasMap />} />
            <Route path="historial" element={<VehicleHistory />} />
            <Route path="historial/:placa" element={<VehicleHistory />} />
            {MODULES.map((m) => (
              <Route key={m.key} path={m.key} element={<ModulePage moduleKey={m.key} />} />
            ))}
            <Route path="usuarios" element={<AdminOnly><UsersPage /></AdminOnly>} />
            <Route path="ciudades" element={<AdminOnly><CiudadesPage /></AdminOnly>} />
          </Route>
          <Route path="/herramientas" element={<Protected><RequireAccess resource="herramientas"><ToolsLayout /></RequireAccess></Protected>}>
            <Route index element={<ToolsDashboard />} />
            <Route path="inventario" element={<HerramientasPage />} />
            <Route path="asignaciones" element={<AsignacionesPage />} />
            <Route path="devoluciones" element={<DevolucionesPage />} />
            <Route path="traspasos" element={<TraspasosPage />} />
            <Route path="bodegas" element={<BodegasPage />} />
            <Route path="historial-tecnico" element={<HistorialTecnicoPage />} />
            <Route path="reporte-actual" element={<ReporteActual />} />
            <Route path="reporte-historico" element={<ReporteHistorico />} />
            <Route path="bajas" element={<BajasPage />} />
            <Route path="usuarios" element={<AdminOnly><UsersPage /></AdminOnly>} />
            <Route path="ciudades" element={<AdminOnly><CiudadesPage /></AdminOnly>} />
          </Route>
          <Route path="/gastos" element={<Protected><RequireAccess resource="gastos"><GastosLayout /></RequireAccess></Protected>}>
            <Route index element={<GastosDashboard />} />
            <Route path="alertas" element={<GastosAlertas />} />
            <Route path="solicitudes" element={<SolicitudesPage />} />
            <Route path="reportes" element={<GastosReportes />} />
            <Route path="usuarios" element={<AdminOnly><UsersPage /></AdminOnly>} />
            <Route path="cuentas" element={<AdminOnly><CuentasPage /></AdminOnly>} />
            <Route path="ciudades" element={<AdminOnly><CiudadesPage /></AdminOnly>} />
          </Route>
          <Route path="/tickets" element={<Protected><RequireTicketRole><TicketsLayout /></RequireTicketRole></Protected>}>
            <Route index element={<TicketsDashboard />} />
            <Route path="tablero" element={<TicketsBoard />} />
            <Route path="listado" element={<TicketsList />} />
            <Route path="t/:id" element={<TicketDetail />} />
            <Route path="ciudades" element={<AdminOnly><CiudadesPage /></AdminOnly>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
