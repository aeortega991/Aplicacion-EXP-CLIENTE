import { useEffect, useState } from "react";
import { API } from "@/lib/api";
import { Button } from "@/components/ui/button";

// Logo oficial de Microsoft (4 cuadros). SVG inline para no depender de assets.
const MsLogo = () => (
  <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
    <rect x="1" y="1" width="10" height="10" fill="#F25022" />
    <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
    <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
    <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
  </svg>
);

/**
 * Botón "Iniciar sesión con Microsoft". Solo se muestra cuando el backend
 * reporta que el SSO de Entra ID está configurado (/auth/microsoft/config).
 * Al hacer clic redirige al flujo OAuth del backend.
 */
export default function MicrosoftSignInButton() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${API}/auth/microsoft/config`)
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((x) => { if (active) setEnabled(Boolean(x.enabled)); })
      .catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, []);

  if (!enabled) return null;

  return (
    <div className="mt-5" data-testid="microsoft-sso-block">
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-neutral-200" /></div>
        <div className="relative flex justify-center"><span className="bg-white px-3 text-xs uppercase tracking-widest text-neutral-400">o</span></div>
      </div>
      <Button
        type="button"
        variant="outline"
        data-testid="microsoft-sso-button"
        onClick={() => { window.location.href = `${API}/auth/microsoft/login`; }}
        className="w-full h-11 gap-3 border-neutral-300 text-neutral-700 hover:bg-neutral-50"
      >
        <MsLogo /> Iniciar sesión con Microsoft
      </Button>
      <p className="mt-2 text-center text-xs text-neutral-400">Usa tu cuenta corporativa de Indurama (Outlook / Microsoft 365).</p>
    </div>
  );
}
