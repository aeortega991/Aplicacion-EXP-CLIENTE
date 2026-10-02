import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Lock, User } from "lucide-react";
import { toast } from "sonner";
import MicrosoftSignInButton from "@/components/MicrosoftSignInButton";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await login(username, password);
    setLoading(false);
    if (res.ok) {
      toast.success("Bienvenido");
      navigate("/");
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 grid lg:grid-cols-2" data-testid="login-page">
      {/* Left: hero panel */}
      <div className="hidden lg:flex relative bg-neutral-900 text-white p-12 flex-col justify-between overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <img src="/indurama-logo.jpg" alt="Indurama" className="h-12 w-auto rounded-md" />
            <div>
              <div className="font-semibold tracking-tight text-lg">Control de Flota</div>
              <div className="text-xs text-neutral-400">by Indurama</div>
            </div>
          </div>
        </div>
        <div className="relative z-10 space-y-4 max-w-md">
          <h1 className="text-4xl font-bold tracking-tight leading-tight">
            Gestiona tu flota con precisión operativa.
          </h1>
          <p className="text-neutral-400 text-sm">
            Vehículos, seguros, impuestos, talleres, conductores, multas y mantenimiento — un solo lugar, control total.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-6 border-t border-neutral-800">
            {["Flota", "Seguros", "Multas", "Impuestos", "Talleres", "Mnto"].map((s) => (
              <div key={s} className="text-xs text-neutral-500 uppercase tracking-widest">
                • {s}
              </div>
            ))}
          </div>
        </div>
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 shadow-none border border-neutral-200">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <img src="/indurama-logo.jpg" alt="Indurama" className="h-10 w-auto rounded-md" />
            <div className="font-semibold text-lg">Control de Flota</div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">Iniciar sesión</h2>
            <p className="text-sm text-neutral-500 mt-1">Ingresa tus credenciales para continuar.</p>
          </div>

          <form onSubmit={submit} className="space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <Input
                  id="username"
                  data-testid="login-username-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="usuario"
                  className="pl-10"
                  autoComplete="username"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <Input
                  id="password"
                  data-testid="login-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit-button"
              className="w-full bg-red-600 hover:bg-red-700 text-white h-11"
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>

          <MicrosoftSignInButton />

          <div className="mt-8 pt-6 border-t border-neutral-200 text-xs text-neutral-500 space-y-1">
            <div className="font-semibold text-neutral-700">Credenciales de acceso:</div>
            <div><span className="font-mono">aeortega</span> / <span className="font-mono">admin123</span> — Admin</div>
            <div><span className="font-mono">operador</span> / <span className="font-mono">operador123</span> — Usuario</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
