import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";

// Selector con búsqueda. options: [{ value, label }]
export const SearchSelect = ({ value, onChange, options, placeholder = "Seleccionar…", disabled, testId, emptyText = "Sin resultados" }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" disabled={disabled} className="w-full justify-between font-normal" data-testid={testId}>
          <span className={`truncate ${selected ? "" : "text-neutral-400"}`}>{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[220px]" align="start">
        <Command>
          <CommandInput placeholder="Buscar…" data-testid={testId ? `${testId}-search` : undefined} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => { onChange(o.value); setOpen(false); }} data-testid={testId ? `${testId}-option` : undefined}>
                  <Check className={`w-4 h-4 mr-2 ${value === o.value ? "opacity-100" : "opacity-0"}`} />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
