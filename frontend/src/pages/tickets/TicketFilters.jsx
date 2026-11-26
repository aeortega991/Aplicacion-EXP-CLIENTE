import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FilterX } from "lucide-react";
import { ESTADOS } from "./estados";

export const EMPTY_FILTERS = { tecnico_id: "", analista_id: "", estado: "", desde: "", hasta: "" };

const Pick = ({ label, value, onChange, options, testId }) => (
  <div className="space-y-1 min-w-0">
    <Label className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</Label>
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger className="h-9 bg-white" data-testid={testId}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos</SelectItem>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

export const TicketFilters = ({ filters, setFilters, options, role }) => {
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end" data-testid="ts-filters">
      {!["tecnico", "lider"].includes(role) && <Pick label="Solicitante" value={filters.tecnico_id} onChange={set("tecnico_id")} options={options.tecnicos || []} testId="ts-filter-tecnico" />}
      {role !== "analista_tecnico" && <Pick label="Responsable" value={filters.analista_id} onChange={set("analista_id")} options={options.analistas || []} testId="ts-filter-analista" />}
      <Pick label="Estado" value={filters.estado} onChange={set("estado")} options={ESTADOS.map((e) => ({ id: e, name: e }))} testId="ts-filter-estado" />
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wider text-neutral-500">Desde</Label>
        <Input type="date" className="h-9 bg-white" value={filters.desde} onChange={(e) => set("desde")(e.target.value)} data-testid="ts-filter-desde" />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] uppercase tracking-wider text-neutral-500">Hasta</Label>
        <Input type="date" className="h-9 bg-white" value={filters.hasta} onChange={(e) => set("hasta")(e.target.value)} data-testid="ts-filter-hasta" />
      </div>
      <Button variant="outline" className="h-9 gap-2" onClick={() => setFilters(EMPTY_FILTERS)} data-testid="ts-filter-clear">
        <FilterX className="w-4 h-4" /> Limpiar
      </Button>
    </div>
  );
};
