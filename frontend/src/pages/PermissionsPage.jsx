import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck, ArrowLeft, Save, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS = {
  user: "Usuario", coordinador: "Coordinador", lider: "Líder",
  tesorero: "Tesorero", gerente: "Gerente", tecnico: "Técnico",
};

export default function PermissionsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [resources, setResources] = useState([]);
  const [roles, setRoles] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && user && user.role !== "admin") navigate("/", { replace: true });
  }, [authLoading, user, navigate]);

  const load = () => {
    setLoading(true);
    api.get("/permissions/matrix")
      .then((r) => { setResources(r.data.resources || []); setRoles(r.data.roles || []); setMatrix(r.data.matrix || {}); })
      .catch((e) => toast.error(formatApiError(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const g = {};
    resources.forEach((r) => { (g[r.module] = g[r.module] || []).push(r); });
    return g;
  }, [resources]);

  const toggle = (role, key, action, value) => {
    setMatrix((m) => {
      const next = { ...m, [role]: { ...m[role], [key]: { ...(m[role]?.[key] || { view: false, edit: false }) } } };
      next[role][key][action] = value;
      // Si quito "ver", también quito "editar" (salvo recursos de solo-registro)
      if (action === "view" && !value) next[role][key].edit = next[role][key].edit && false;
      // Si doy "editar", garantizo coherencia (no forzamos ver: permite "registrar sin ver")
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/permissions/matrix", { matrix });
      toast.success("Permisos guardados");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-10 text-sm text-neutral-500">Cargando matriz…</div>;

  return (
    <div className="min-h-screen bg-neutral-50" data-testid="permissions-page">
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="text-neutral-500 hover:text-red-600" data-testid="perms-back"><ArrowLeft className="w-5 h-5" /></button>
            <div className="w-9 h-9 rounded-md bg-[#0033a0] flex items-center justify-center text-white"><ShieldCheck className="w-5 h-5" /></div>
            <div>
              <div className="text-sm font-bold tracking-tight leading-tight">Matriz de permisos</div>
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Acceso por rol</div>
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="perms-save">
            <Save className="w-4 h-4" /> {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8">
        <p className="text-sm text-neutral-500 mb-2 max-w-3xl">
          Define qué <b>ve</b> (<Eye className="inline w-3.5 h-3.5" />) y qué puede <b>crear/editar</b> (<Pencil className="inline w-3.5 h-3.5" />) cada rol.
          El administrador siempre tiene acceso total. Crear/editar aplica a los módulos de datos de Vehículos.
        </p>

        {Object.entries(grouped).map(([moduleName, items]) => (
          <Card key={moduleName} className="mb-6 border border-neutral-200 shadow-none overflow-hidden">
            <div className="px-4 py-3 bg-neutral-900 text-white text-sm font-semibold tracking-tight">{moduleName}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200">
                    <th className="text-left px-4 py-2 font-semibold text-neutral-600 min-w-[220px]">Sección</th>
                    {roles.map((role) => (
                      <th key={role} className="px-3 py-2 text-center font-semibold text-neutral-600 whitespace-nowrap">{ROLE_LABELS[role] || role}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((res) => (
                    <tr key={res.key} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/60">
                      <td className="px-4 py-2.5 text-neutral-800">{res.label}</td>
                      {roles.map((role) => {
                        const cell = matrix[role]?.[res.key] || { view: false, edit: false };
                        return (
                          <td key={role} className="px-3 py-2.5">
                            <div className="flex items-center justify-center gap-3">
                              <label className="inline-flex items-center gap-1 cursor-pointer" title="Ver">
                                <Checkbox checked={!!cell.view} onCheckedChange={(v) => toggle(role, res.key, "view", !!v)} data-testid={`perm-${role}-${res.key}-view`} />
                                <Eye className="w-3.5 h-3.5 text-neutral-400" />
                              </label>
                              {res.editable && (
                                <label className="inline-flex items-center gap-1 cursor-pointer" title="Crear / editar">
                                  <Checkbox checked={!!cell.edit} onCheckedChange={(v) => toggle(role, res.key, "edit", !!v)} data-testid={`perm-${role}-${res.key}-edit`} />
                                  <Pencil className="w-3.5 h-3.5 text-neutral-400" />
                                </label>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="perms-save-bottom">
            <Save className="w-4 h-4" /> {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </main>
    </div>
  );
}
