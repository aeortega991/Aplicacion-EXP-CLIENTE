export const LINEAS = [
  { value: "blanca", label: "Línea Blanca" },
  { value: "cafe", label: "Línea Café" },
];

export const lineaLabel = (v) => LINEAS.find((l) => l.value === v)?.label || (v === "general" ? "General" : v);

export const LineaBadges = ({ lineas = [] }) => (
  <div className="flex flex-wrap gap-1">
    {lineas.map((l) => (
      <span key={l} className={`text-[11px] px-2 py-0.5 rounded-full border ${l === "blanca" ? "bg-sky-50 border-sky-200 text-sky-700" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
        {lineaLabel(l)}
      </span>
    ))}
  </div>
);
