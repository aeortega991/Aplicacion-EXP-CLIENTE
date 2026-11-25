import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Download } from "lucide-react";

export const TicketMedia = ({ media }) => {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objUrl;
    api.get(`/ts/media/${media.id}`, { responseType: "blob" })
      .then((r) => { objUrl = URL.createObjectURL(r.data); setUrl(objUrl); })
      .catch(() => setError(true));
    return () => objUrl && URL.revokeObjectURL(objUrl);
  }, [media.id]);

  const isVideo = (media.content_type || "").startsWith("video");
  if (error) return <div className="text-xs text-red-600">No se pudo cargar el archivo.</div>;
  if (!url) return <div className="h-48 rounded-md bg-neutral-100 animate-pulse" />;
  return (
    <div className="space-y-1" data-testid={`ts-media-${media.id}`}>
      {isVideo
        ? <video src={url} controls playsInline className="w-full max-h-80 rounded-md bg-black" />
        : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={media.original_filename} className="w-full max-h-80 object-contain rounded-md bg-neutral-100" /></a>}
      <a href={url} download={media.original_filename} className="inline-flex items-center gap-1 text-xs text-[#0033A0] hover:underline">
        <Download className="w-3 h-3" /> {media.original_filename}
      </a>
    </div>
  );
};
