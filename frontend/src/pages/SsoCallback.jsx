import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const ERRORS = {
  estado_invalido: "Respuesta de autenticación inválida.",
  estado_expirado: "La sesión de inicio expiró. Intenta de nuevo.",
  respuesta_invalida: "No se pudo validar la respuesta de Microsoft.",
  autenticacion_fallida: "Microsoft rechazó el inicio de sesión.",
  tenant_no_valido: "Tu cuenta no pertenece a la organización autorizada.",
  sin_correo: "Tu cuenta de Microsoft no tiene un correo asociado.",
  usuario_no_registrado: "Tu correo no está registrado en el sistema. Contacta al administrador.",
};

/**
 * Página de retorno del SSO de Microsoft. El backend redirige aquí con el
 * JWT en el fragmento de la URL (#token=...) o con un #error=...
 */
export default function SsoCallback() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(hash);
    const token = params.get("token");
    const err = params.get("error");
    // Limpia el fragmento de la barra de direcciones por higiene.
    window.history.replaceState(null, "", window.location.pathname);

    if (err) { setError(ERRORS[err] || "No se pudo iniciar sesión con Microsoft."); return; }
    if (!token) { setError("No se recibió un token de sesión."); return; }

    loginWithToken(token).then((res) => {
      if (res.ok) {
        toast.success("Bienvenido");
        navigate("/", { replace: true });
      } else {
        setError(res.error || "No se pudo establecer la sesión.");
      }
    });
  }, [loginWithToken, navigate]);

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6" data-testid="sso-callback-page">
      <div className="text-center max-w-sm">
        {error ? (
          <>
            <AlertTriangle className="w-10 h-10 mx-auto text-red-600 mb-3" />
            <h1 className="text-lg font-semibold text-neutral-800">No se pudo iniciar sesión</h1>
            <p className="text-sm text-neutral-500 mt-1" data-testid="sso-error-message">{error}</p>
            <button
              onClick={() => navigate("/login", { replace: true })}
              className="mt-6 text-sm font-medium text-[#0033a0] hover:underline"
              data-testid="sso-back-to-login"
            >Volver al inicio de sesión</button>
          </>
        ) : (
          <>
            <Loader2 className="w-10 h-10 mx-auto text-[#0033a0] animate-spin mb-3" />
            <p className="text-sm text-neutral-500">Validando tu sesión con Microsoft…</p>
          </>
        )}
      </div>
    </div>
  );
}
