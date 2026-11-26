import { useEffect, useMemo, useState } from "react";
import api, { formatApiError, money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Ban, CheckCircle2, Search } from "lucide-react";
import { toast } from "sonner";

export default function BajasPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState(null);

  const load = () => api.get("/tools/tools").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => String(v || "").toLowerCase().includes(s)));
  }, [rows, q]);

  const toggle = async () => {
    if (!confirm) return;
    const newEstado = confirm.estado === "Activa" ? "Inactiva" : "Activa";
    try {
      await api.patch(`/tools/tools/${confirm.id}`, { estado: newEstado });
      toast.success(newEstado === "Inactiva" ? "Herramienta dada de baja" : "Herramienta reactivada", { description: "Ingresada a la Bodega Central" });
      setConfirm(null);
      load();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <div className="p-8 space-y-6" data-testid="tools-bajas">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Operación</div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2"><Ban className="w-7 h-7 text-red-600" /> Bajas de Herramientas</h1>
          <p className="text-sm text-neutral-500 mt-1">Selecciona el ID de una herramienta para cambiar su estado. Las herramientas Inactivas no pueden asignarse.</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <Input placeholder="Buscar por ID, marca…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-10 w-64" />
        </div>
      </div>

      <Card className="border border-neutral-200 shadow-none overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
              <TableHead className="text-xs uppercase tracking-wider">ID</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Marca</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Modelo</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Serie</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Valor</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Estado actual</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.tool_id}</TableCell>
                <TableCell className="font-medium">{r.marca}</TableCell>
                <TableCell>{r.modelo || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.serie || "—"}</TableCell>
                <TableCell className="text-right font-mono">{money(r.valor)}</TableCell>
                <TableCell>
                  <Badge className={r.estado === "Activa" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>{r.estado}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant={r.estado === "Activa" ? "outline" : "default"}
                    size="sm"
                    className={r.estado === "Activa" ? "" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                    onClick={() => setConfirm(r)}
                    data-testid={`toggle-${r.tool_id}`}
                  >
                    {r.estado === "Activa" ? <><Ban className="w-3 h-3 mr-1" /> Dar de baja</> : <><CheckCircle2 className="w-3 h-3 mr-1" /> Reactivar</>}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.estado === "Activa" ? "¿Dar de baja?" : "¿Reactivar herramienta?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.estado === "Activa"
                ? `La herramienta ${confirm?.tool_id} (${confirm?.marca} ${confirm?.modelo}) pasará a Inactiva y no podrá asignarse. Si tiene una asignación vigente, esta se cerrará automáticamente.`
                : `La herramienta ${confirm?.tool_id} volverá a estar disponible para asignación.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={toggle} className={confirm?.estado === "Activa" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
