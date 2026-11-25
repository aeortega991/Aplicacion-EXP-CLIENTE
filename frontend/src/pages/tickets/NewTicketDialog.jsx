import { useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const EXTS = ["jpg", "jpeg", "png", "webp", "mp4", "mov"];
const empty = { modelo: "", serie: "", descripcion: "" };

export const NewTicketDialog = ({ open, onOpenChange, maxMb = 25, onCreated }) => {
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const missing = [];
    if (!form.modelo.trim()) missing.push("Modelo");
    if (!form.serie.trim()) missing.push("Serie");
    if (!file) missing.push("Multimedia");
    if (!form.descripcion.trim()) missing.push("Descripción del daño");
    if (missing.length) return `Campos obligatorios: ${missing.join(", ")}`;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!EXTS.includes(ext)) return "Formato no permitido. Use JPG, JPEG, PNG, WEBP, MP4 o MOV";
    if (file.size > maxMb * 1024 * 1024) return `El archivo supera el límite de ${maxMb} MB`;
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v.trim()));
    fd.append("file", file);
    setSaving(true); setProgress(0);
    try {
      const { data } = await api.post("/ts/tickets", fd, {
        onUploadProgress: (e) => e.total && setProgress(Math.round((e.loaded * 100) / e.total)),
      });
      toast.success(`Ticket ${data.ticket.numero} creado${data.ticket.analista_nombre ? ` y asignado a ${data.ticket.analista_nombre}` : ""}`);
      if (data.warning) toast.warning(data.warning, { duration: 8000 });
      setForm(empty); setFile(null);
      onOpenChange(false);
      onCreated?.(data.ticket);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto" data-testid="ts-new-dialog">
        <DialogHeader>
          <DialogTitle>Nuevo ticket de servicio</DialogTitle>
          <DialogDescription>Todos los campos son obligatorios. Una vez creado no podrá modificarse.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Modelo *</Label>
              <Input value={form.modelo} onChange={set("modelo")} data-testid="ts-new-modelo" />
            </div>
            <div className="space-y-1.5">
              <Label>Serie *</Label>
              <Input value={form.serie} onChange={set("serie")} data-testid="ts-new-serie" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Multimedia * <span className="text-xs text-neutral-400">(foto o video corto, máx. {maxMb} MB)</span></Label>
            <Input type="file" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,image/*,video/mp4,video/quicktime"
              onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="ts-new-file" />
            {file && <div className="text-xs text-neutral-500 truncate">{file.name} · {(file.size / 1048576).toFixed(1)} MB</div>}
          </div>
          <div className="space-y-1.5">
            <Label>Descripción del daño *</Label>
            <Textarea rows={4} value={form.descripcion} onChange={set("descripcion")} data-testid="ts-new-descripcion" />
          </div>
          {saving && <Progress value={progress} data-testid="ts-new-progress" />}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-[#0033A0] hover:bg-[#002a85]" data-testid="ts-new-submit">
            {saving ? `Enviando… ${progress}%` : "Crear ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
