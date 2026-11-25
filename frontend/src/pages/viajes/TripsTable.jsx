import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

const PAGE = 15;

export const TripBadge = ({ estado }) => {
  const open = estado === "En curso";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${open ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-green-50 text-green-700 border-green-200"}`} data-testid="trip-estado">
      <span className={`w-1.5 h-1.5 rounded-full ${open ? "bg-amber-500" : "bg-green-600"}`} /> {estado || "Finalizado"}
    </span>
  );
};

export const tripRoute = (t) => t.Ruta || [t.Origen, t.Destino].filter(Boolean).join(" → ") || "—";

export const TripsTable = ({ trips }) => {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return trips.filter((t) =>
      (estado === "all" || (t["Estado Viaje"] || "Finalizado") === estado) &&
      (!s || [t["Codigo Viaje"], t["Placa Vehiculo"], t.Conductor, tripRoute(t)].some((v) => String(v || "").toLowerCase().includes(s)))
    );
  }, [trips, q, estado]);
  useEffect(() => setPage(1), [q, estado, trips]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="space-y-3" data-testid="trips-table">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-neutral-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código, vehículo, conductor o ruta" className="pl-8 h-9" data-testid="trips-search" />
        </div>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-40 h-9" data-testid="trips-estado-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="En curso">En curso</SelectItem>
            <SelectItem value="Finalizado">Finalizado</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-neutral-500 ml-auto" data-testid="trips-count">{filtered.length} viaje(s)</span>
      </div>
      <div className="bg-white border border-neutral-200 rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50">
              {["Código", "Fecha salida", "Vehículo", "Conductor", "Ruta", "Estado"].map((h) => <TableHead key={h} className="text-xs uppercase tracking-wider whitespace-nowrap">{h}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} data-testid="trip-row">
                <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">{t["Codigo Viaje"] || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{String(t["Fecha de Salida"] || "—").slice(0, 10)}</TableCell>
                <TableCell className="whitespace-nowrap">{t["Placa Vehiculo"] || "—"}</TableCell>
                <TableCell>{t.Conductor || "—"}</TableCell>
                <TableCell>{tripRoute(t)}</TableCell>
                <TableCell><TripBadge estado={t["Estado Viaje"]} /></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-neutral-400 py-8">No hay viajes</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-2 text-xs text-neutral-500">
        <Button size="icon" variant="outline" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
        <span>{page} / {pages}</span>
        <Button size="icon" variant="outline" className="h-7 w-7" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
};
