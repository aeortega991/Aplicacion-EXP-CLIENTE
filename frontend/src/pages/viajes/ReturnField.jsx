import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Campo del formulario de retorno: reutiliza la definición de campos del módulo Rutas (tipos, obligatoriedad y cálculos)
export const ReturnField = ({ f, value, merged, onChange }) => {
  const id = `retorno-${f.key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  let input;
  if (f.derived) {
    input = <Input value={f.derived(merged)} readOnly className="bg-neutral-100" data-testid={id} />;
  } else if (f.type === "select") {
    input = (
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger data-testid={id}><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
        <SelectContent>{(f.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    );
  } else if (f.type === "textarea") {
    input = <Textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={3} data-testid={id} />;
  } else {
    input = (
      <Input type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"} step={f.type === "number" ? "any" : undefined}
        value={value ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={id} />
    );
  }
  return (
    <div className={f.type === "textarea" ? "md:col-span-2 space-y-2" : "space-y-2"}>
      <Label>{f.label}{f.required ? " *" : ""}</Label>
      {input}
    </div>
  );
};
