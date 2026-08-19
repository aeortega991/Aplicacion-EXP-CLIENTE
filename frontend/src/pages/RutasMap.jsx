import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Tooltip } from "react-leaflet";
import { MapPin, Route as RouteIcon } from "lucide-react";
import "leaflet/dist/leaflet.css";

export default function RutasMap() {
  const [data, setData] = useState(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchMap = async () => {
    setLoading(true);
    const params = {};
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    try {
      const r = await api.get("/rutas/map", { params });
      setData(r.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMap(); /* eslint-disable-next-line */ }, [desde, hasta]);

  const clear = () => { setDesde(""); setHasta(""); };

  if (loading && !data) return <div className="p-10 text-neutral-500">Cargando mapa…</div>;

  const maxViajes = data && data.ciudades.length > 0 ? Math.max(...data.ciudades.map((c) => c.viajes)) : 1;
  const maxRuta = data && data.rutas.length > 0 ? Math.max(...data.rutas.map((r) => r.viajes)) : 1;

  return (
    <div className="p-8 space-y-6" data-testid="map-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-1">Análisis geográfico</div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <RouteIcon className="w-7 h-7 text-red-600" /> Mapa de Rutas
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Orígenes, destinos y rutas más frecuentes de la flota.
          </p>
        </div>
        <div className="flex items-end gap-2 bg-white border border-neutral-200 rounded-md p-3">
          <div className="space-y-1">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" data-testid="map-desde" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" data-testid="map-hasta" />
          </div>
          {(desde || hasta) && <Button variant="ghost" size="sm" onClick={clear}>Limpiar</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 border border-neutral-200 shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-500">Ciudades</div>
              <div className="text-3xl font-bold font-mono mt-1">{data?.ciudades.length || 0}</div>
            </div>
            <MapPin className="w-6 h-6 text-red-600" />
          </div>
        </Card>
        <Card className="p-5 border border-neutral-200 shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-500">Rutas únicas</div>
              <div className="text-3xl font-bold font-mono mt-1">{data?.rutas.length || 0}</div>
            </div>
            <RouteIcon className="w-6 h-6 text-blue-600" />
          </div>
        </Card>
        <Card className="p-5 border border-neutral-200 shadow-none">
          <div className="text-xs uppercase tracking-widest text-neutral-500">Ruta más frecuente</div>
          {data?.rutas[0] ? (
            <div className="mt-1">
              <div className="text-sm font-semibold">{data.rutas[0].origen} ↔ {data.rutas[0].destino}</div>
              <div className="text-xs text-neutral-500 font-mono">{data.rutas[0].viajes} viajes</div>
            </div>
          ) : <div className="text-sm text-neutral-400 mt-2">—</div>}
        </Card>
      </div>

      <Card className="border border-neutral-200 shadow-none overflow-hidden">
        <div className="h-[560px]">
          <MapContainer
            center={[-1.5, -78.5]}
            zoom={7}
            style={{ height: "100%", width: "100%" }}
            data-testid="map-container"
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {data?.rutas.map((r, idx) => {
              const w = 1 + (r.viajes / maxRuta) * 5;
              return (
                <Polyline
                  key={idx}
                  positions={r.coords}
                  color="#D92D20"
                  weight={w}
                  opacity={0.5}
                >
                  <Tooltip>
                    <strong>{r.origen} ↔ {r.destino}</strong><br />
                    <span style={{ fontFamily: "monospace" }}>{r.viajes} viajes</span>
                  </Tooltip>
                </Polyline>
              );
            })}
            {data?.ciudades.map((c) => {
              const radius = 6 + (c.viajes / maxViajes) * 18;
              return (
                <CircleMarker
                  key={c.nombre}
                  center={[c.lat, c.lng]}
                  radius={radius}
                  fillColor="#2563EB"
                  color="#FFFFFF"
                  weight={2}
                  fillOpacity={0.75}
                >
                  <Popup>
                    <div style={{ minWidth: 120 }}>
                      <strong>{c.nombre}</strong><br />
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{c.viajes} viajes registrados</span>
                    </div>
                  </Popup>
                  <Tooltip permanent direction="top" offset={[0, -radius]} className="!bg-transparent !border-0 !shadow-none">
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#111827", textShadow: "0 0 3px white" }}>
                      {c.nombre}
                    </span>
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border border-neutral-200 shadow-none p-5">
          <h3 className="font-semibold mb-3">Top ciudades por movimiento</h3>
          <div className="space-y-2">
            {data?.ciudades.slice(0, 10).map((c) => (
              <div key={c.nombre} className="flex items-center justify-between text-sm">
                <span className="font-medium">{c.nombre}</span>
                <div className="flex items-center gap-2 flex-1 mx-3">
                  <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-600" style={{ width: `${(c.viajes / maxViajes) * 100}%` }} />
                  </div>
                </div>
                <span className="font-mono text-neutral-600 w-14 text-right">{c.viajes}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="border border-neutral-200 shadow-none p-5">
          <h3 className="font-semibold mb-3">Rutas más frecuentes</h3>
          <div className="space-y-2">
            {data?.rutas.slice(0, 10).map((r, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="truncate">{r.origen} ↔ {r.destino}</span>
                <Badge variant="secondary" className="font-mono">{r.viajes}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {data?.no_mapeadas.length > 0 && (
        <Card className="border border-neutral-200 shadow-none p-4 text-xs text-neutral-500">
          <strong>Ciudades no mapeadas ({data.no_mapeadas.length}):</strong>{" "}
          {data.no_mapeadas.slice(0, 20).join(", ")}
          {data.no_mapeadas.length > 20 && "…"}
        </Card>
      )}
    </div>
  );
}
