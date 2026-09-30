import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
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

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Hub /></Protected>} />
          <Route path="/vehiculos" element={<Protected><AppLayout /></Protected>}>
            <Route index element={<Dashboard />} />
            <Route path="alertas" element={<AlertsPage />} />
            <Route path="mapa" element={<RutasMap />} />
            <Route path="historial" element={<VehicleHistory />} />
            <Route path="historial/:placa" element={<VehicleHistory />} />
            {MODULES.map((m) => (
              <Route key={m.key} path={m.key} element={<ModulePage moduleKey={m.key} />} />
            ))}
            <Route path="usuarios" element={<AdminOnly><UsersPage /></AdminOnly>} />
          </Route>
          <Route path="/herramientas" element={<Protected><ToolsLayout /></Protected>}>
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
          </Route>
          <Route path="/gastos" element={<Protected><GastosLayout /></Protected>}>
            <Route index element={<GastosDashboard />} />
            <Route path="solicitudes" element={<SolicitudesPage />} />
            <Route path="usuarios" element={<AdminOnly><UsersPage /></AdminOnly>} />
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
