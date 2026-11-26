import { useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Upload, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

/**
 * Botón + diálogo de carga masiva desde Excel (solo visible para administradores).
 * Descarga una plantilla y sube un archivo .xlsx para insertar registros en lote.
 */
export default function BulkUploadDialog({ templateUrl, importUrl, title = "Carga masiva", templateName = "plantilla.xlsx", onDone, buttonClassName = "", description, testId = "bulk-upload-button" }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const downloadTemplate = async () => {
    try {
      const r = await api.get(templateUrl, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = templateName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Plantilla descargada");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api.post(importUrl, form, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(r.data);
      if (r.data.inserted > 0 || r.data.updated > 0) toast.success(`${r.data.inserted} registros importados${r.data.updated ? ` · ${r.data.updated} actualizados` : ""}`);
      else toast.warning("No se importó ningún registro");
      onDone && onDone();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <Button variant="outline" className={`gap-2 ${buttonClassName}`} onClick={() => { setResult(null); setOpen(true); }} data-testid={testId}>
        <Upload className="w-4 h-4" /> Carga masiva
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-red-600" /> {title}</DialogTitle>
            <DialogDescription>{description || "Descarga la plantilla, complétala y súbela para crear varios registros a la vez."}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-neutral-200 p-4">
              <div className="text-sm font-medium mb-1">Paso 1 · Plantilla</div>
              <p className="text-xs text-neutral-500 mb-3">Usa exactamente los encabezados de la plantilla. No cambies la primera fila.</p>
              <Button variant="outline" size="sm" className="gap-2" onClick={downloadTemplate} data-testid="bulk-download-template">
                <Download className="w-4 h-4" /> Descargar plantilla
              </Button>
            </div>

            <div className="rounded-lg border border-neutral-200 p-4">
              <div className="text-sm font-medium mb-1">Paso 2 · Subir archivo</div>
              <p className="text-xs text-neutral-500 mb-3">Formato .xlsx. Las filas vacías se ignoran.</p>
              <input ref={fileRef} type="file" accept=".xlsx" onChange={onFile} disabled={uploading}
                className="block w-full text-sm text-neutral-600 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-red-600 file:text-white hover:file:bg-red-700 file:cursor-pointer"
                data-testid="bulk-file-input" />
              {uploading && <div className="mt-3 flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="w-4 h-4 animate-spin" /> Importando…</div>}
            </div>

            {result && (
              <div className={`rounded-lg border p-4 text-sm ${result.inserted > 0 || result.updated > 0 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`} data-testid="bulk-result">
                <div className="flex items-center gap-2 font-medium">
                  {result.inserted > 0 || result.updated > 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                  {result.inserted} de {result.total_filas} filas importadas
                </div>
                {result.updated > 0 && <div className="mt-1 text-xs text-emerald-700" data-testid="bulk-updated">{result.updated} registro(s) existente(s) actualizado(s)</div>}
                {result.duplicates > 0 && <div className="mt-1 text-xs text-amber-700" data-testid="bulk-duplicates">{result.duplicates} duplicado(s) omitido(s)</div>}
                {result.errors && result.errors.length > 0 && (
                  <ul className="mt-2 list-disc list-inside text-xs text-red-600 max-h-28 overflow-y-auto">
                    {result.errors.slice(0, 10).map((er, i) => <li key={i}>{er}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
