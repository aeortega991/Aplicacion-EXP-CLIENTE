import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { MapPin, ChevronDown, X } from "lucide-react";

/**
 * CityFilter - admin-only multi-select city filter driven by /api/cities.
 * Persists across modules via localStorage.
 * Emits selected cities (array) via onChange.
 */
export default function CityFilter({ selected, onChange, testId = "city-filter" }) {
  const [cities, setCities] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/cities").then((r) => setCities(r.data.cities || [])).catch(() => setCities([]));
  }, []);

  const toggle = (c) => {
    if (selected.includes(c)) onChange(selected.filter((x) => x !== c));
    else onChange([...selected, c]);
  };

  const label = selected.length === 0
    ? "Todas las ciudades"
    : selected.length === 1
      ? selected[0]
      : `${selected.length} ciudades`;

  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2 min-w-[200px] justify-between" data-testid={`${testId}-trigger`}>
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-neutral-500" />
              <span className="truncate">{label}</span>
            </span>
            <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end">
          <div className="p-3 border-b border-neutral-200 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-neutral-500">Filtrar por ciudad</span>
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="text-xs text-red-600 hover:text-red-700 font-medium">
                Limpiar
              </button>
            )}
          </div>
          <div className="p-2 max-h-72 overflow-y-auto">
            <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-50 rounded cursor-pointer">
              <Checkbox checked={selected.length === 0} onCheckedChange={() => onChange([])} />
              <span className="text-sm font-medium">— Todas —</span>
            </label>
            {cities.map((c) => (
              <label key={c} className="flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-50 rounded cursor-pointer" data-testid={`${testId}-option-${c}`}>
                <Checkbox checked={selected.includes(c)} onCheckedChange={() => toggle(c)} />
                <span className="text-sm">{c}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && selected.length <= 4 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((c) => (
            <Badge key={c} variant="secondary" className="gap-1 pr-1">
              {c}
              <button type="button" onClick={() => toggle(c)} className="hover:text-red-600">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
