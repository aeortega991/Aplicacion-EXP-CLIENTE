import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import AppLayout from "@/layouts/AppLayout";
import Dashboard from "@/pages/Dashboard";
import ModulePage from "@/pages/ModulePage";
import UsersPage from "@/pages/UsersPage";
import AlertsPage from "@/pages/AlertsPage";
import RutasMap from "@/pages/RutasMap";
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
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <AppLayout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="alertas" element={<AlertsPage />} />
            <Route path="mapa" element={<RutasMap />} />
            {MODULES.map((m) => (
              <Route key={m.key} path={m.key} element={<ModulePage moduleKey={m.key} />} />
            ))}
            <Route
              path="usuarios"
              element={
                <AdminOnly>
                  <UsersPage />
                </AdminOnly>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
    </AuthProvider>
  );
}

export default App;
