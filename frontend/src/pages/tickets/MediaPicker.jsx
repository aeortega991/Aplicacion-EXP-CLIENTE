import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Video, Upload, X } from "lucide-react";

const EXTS = ["jpg", "jpeg", "png", "webp", "mp4", "mov"];
const MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov" };

// Algunas cámaras entregan archivos sin extensión: se la asignamos según el tipo
const normalize = (f) => {
  if (!f) return null;
  const ext = f.name.includes(".") ? f.name.split(".").pop().toLowerCase() : "";
  if (EXTS.includes(ext) || !MIME_EXT[f.type]) return f;
  return new File([f], `captura-${Date.now()}.${MIME_EXT[f.type]}`, { type: f.type });
};

const SOURCES = [
  { key: "photo", label: "Tomar foto", icon: Camera, accept: "image/*", capture: "environment" },
  { key: "video", label: "Grabar video", icon: Video, accept: "video/*", capture: "environment" },
  { key: "file", label: "Galería / archivo", icon: Upload, accept: ".jpg,.jpeg,.png,.webp,.mp4,.mov,image/*,video/mp4,video/quicktime" },
];

export const MediaPicker = ({ file, onChange, maxMb }) => {
  const refs = useRef({});
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!file) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (e) => { onChange(normalize(e.target.files?.[0])); e.target.value = ""; };
  const isVideo = file?.type?.startsWith("video");

  return (
    <div className="space-y-2" data-testid="ts-media-picker">
      <div className="grid grid-cols-3 gap-2">
        {SOURCES.map((s) => (
          <div key={s.key}>
            <input ref={(el) => (refs.current[s.key] = el)} type="file" accept={s.accept} capture={s.capture} className="hidden" onChange={pick} data-testid={`ts-new-file-${s.key}`} />
            <Button type="button" variant="outline" onClick={() => refs.current[s.key]?.click()} className="w-full h-auto py-3 flex-col gap-1 text-xs" data-testid={`ts-new-${s.key}-btn`}>
              <s.icon className="w-5 h-5 text-[#0033A0]" /> {s.label}
            </Button>
          </div>
        ))}
      </div>
      {file && (
        <div className="relative rounded-md border border-neutral-200 bg-neutral-50 p-2" data-testid="ts-new-preview">
          {preview && (isVideo
            ? <video src={preview} controls playsInline className="w-full max-h-56 rounded bg-black" />
            : <img src={preview} alt="Vista previa" className="w-full max-h-56 object-contain rounded" />)}
          <div className="text-xs text-neutral-500 truncate mt-1 pr-8">{file.name} · {(file.size / 1048576).toFixed(1)} MB{file.size > maxMb * 1048576 ? " — supera el límite" : ""}</div>
          <button type="button" onClick={() => onChange(null)} className="absolute top-2 right-2 rounded-full bg-white/90 p-1 shadow hover:text-red-600" data-testid="ts-new-file-remove">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
