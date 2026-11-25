// Module schemas mirror the Excel sheet columns exactly (Spanish).
// Extended field props: dynamicSource, sourceKey, sourceFilter (obj), autoGenerate, derived

export const MODULES = [
  {
    key: "flota",
    label: "Flota",
    icon: "Truck",
    fields: [
      { key: "Nro", label: "ID", type: "number", autoGenerate: true },
      { key: "Tipo", label: "Tipo", type: "select", options: ["CAMIONETA", "CAMION", "AUTOMOVIL", "MOTO", "FURGON"] },
      { key: "Marca", label: "Marca", type: "text" },
      { key: "Modelo", label: "Modelo", type: "text" },
      { key: "Placa Vehiculo", label: "Placa", type: "text", required: true },
      { key: "Codigo de activo", label: "Código de Activo", type: "text" },
      { key: "Color", label: "Color", type: "text" },
      { key: "Año de fabricacion", label: "Año Fabricación", type: "number" },
      { key: "Empresa", label: "Empresa", type: "text" },
      { key: "Ubicacion", label: "Ciudad", type: "select", dynamicSource: "ciudades", sourceKey: "nombre" },
      { key: "Estado Vehiculo", label: "Estado", type: "select", options: ["Disponible", "En Ruta", "En Taller", "Baja"] },
      { key: "Kms Odómetro Mnnto. Preventivo", label: "Odómetro Último Mnto (Km)", type: "number", autoGenerate: true },
      { key: "Kms Odómetro Actual", label: "Odómetro Actual (Km)", type: "number", autoGenerate: true },
      { key: "Falta para el próximo Mnnto Prev. (Km)", label: "Falta Próx. Mnto (Km)", type: "number", autoGenerate: true },
      { key: "Status", label: "Status", type: "select", options: ["Activo", "Inactivo"] },
      { key: "Usuario asignado", label: "Usuario Asignado (Técnico)", type: "select", dynamicSource: "tecnicos", sourceKey: "nombre" },
    ],
    listColumns: ["Nro", "Placa Vehiculo", "Tipo", "Marca", "Modelo", "Año de fabricacion", "Ubicacion", "Kms Odómetro Mnnto. Preventivo", "Kms Odómetro Actual", "Falta para el próximo Mnnto Prev. (Km)", "Estado Vehiculo", "Status", "Usuario asignado"],
  },
  {
    key: "seguros",
    label: "Seguros",
    icon: "ShieldCheck",
    fields: [
      { key: "Nro", label: "Nro", type: "number" },
      { key: "Placa Vehiculo", label: "Placa", type: "text", required: true },
      { key: "Aseguradora", label: "Aseguradora", type: "text" },
      { key: "Poliza seguro", label: "Póliza", type: "text" },
      { key: "Fecha de inicio", label: "Fecha Inicio", type: "date" },
      { key: "Fecha de Vencimiento", label: "Fecha Vencimiento", type: "date" },
      { key: "Importe Pagado ()", label: "Importe Pagado ($)", type: "number" },
      { key: "Fecha de Pago", label: "Fecha de Pago", type: "date" },
      { key: "Estado Poliza", label: "Estado Póliza", type: "select", options: ["Vigente", "Vencida", "Por Vencer"] },
    ],
    listColumns: ["Placa Vehiculo", "Aseguradora", "Poliza seguro", "Fecha de Vencimiento", "Importe Pagado ()", "Estado Poliza"],
  },
  {
    key: "impuestos",
    label: "Impuestos",
    icon: "FileText",
    fields: [
      { key: "Nro", label: "Nro", type: "number" },
      { key: "Placa Vehiculo", label: "Placa", type: "text", required: true },
      { key: "Fecha de RTV", label: "Fecha de RTV", type: "text" },
      { key: "Tipo Impuesto", label: "Tipo Impuesto", type: "select", options: ["MATRICULACIÓN", "SPPAT", "RODAJE", "TRANSFERENCIA"] },
      { key: "Año Impuesto", label: "Año", type: "number" },
      { key: "Impuesto ($)", label: "Impuesto ($)", type: "number" },
      { key: "Fecha de pago", label: "Fecha de Pago", type: "date" },
      { key: "Ciudad", label: "Ciudad", type: "text" },
      { key: "Responsable", label: "Responsable", type: "text" },
    ],
    listColumns: ["Placa Vehiculo", "Tipo Impuesto", "Año Impuesto", "Impuesto ($)", "Fecha de pago", "Ciudad", "Responsable"],
  },
  {
    key: "talleres",
    label: "Talleres",
    icon: "Wrench",
    fields: [
      { key: "Nro", label: "Nro", type: "number" },
      { key: "Nombre del Taller", label: "Nombre del Taller", type: "text", required: true },
      { key: "Dirección", label: "Dirección", type: "text" },
      { key: "Teléfono/Celular", label: "Teléfono", type: "text" },
      { key: "Correo", label: "Correo", type: "text" },
      { key: "Contacto Principal", label: "Contacto Principal", type: "text" },
    ],
    listColumns: ["Nombre del Taller", "Dirección", "Teléfono/Celular", "Correo", "Contacto Principal"],
  },
  {
    key: "rutas",
    label: "Rutas",
    icon: "Route",
    fields: [
      { key: "Fecha de Salida", label: "Fecha de Salida", type: "date", required: true },
      { key: "Fecha de Llegada", label: "Fecha de Llegada", type: "date", required: true },
      { key: "Placa Vehiculo", label: "Vehículo (Placa)", type: "select", required: true, dynamicSource: "flota", sourceKey: "Placa Vehiculo", sourceFilter: { key: "Status", equals: "Activo" } },
      { key: "Conductor", label: "Conductor (Técnico)", type: "select", dynamicSource: "tecnicos", sourceKey: "nombre" },
      { key: "Kms Inicial (Odómetro)", label: "Km Salida (Odómetro)", type: "number", required: true },
      { key: "Kms Final (Odómetro)", label: "Km Regreso (Odómetro)", type: "number", required: true },
      { key: "Kms Recorridos", label: "Km Recorridos (auto)", type: "number", derived: (d) => Math.max(Number(d["Kms Final (Odómetro)"] || 0) - Number(d["Kms Inicial (Odómetro)"] || 0), 0) },
      { key: "Estación de Combustible", label: "Estación de Combustible", type: "text" },
      { key: "Tipo de Combustible", label: "Tipo de Combustible", type: "select", options: ["Diesel", "Gasolina Extra", "Gasolina Super", "Ecopaís"] },
      { key: "Precio x Galón ($/gal)", label: "Precio por Galón ($/gal)", type: "number" },
      { key: "Total Combustible ($)", label: "Total Combustible ($)", type: "number" },
      { key: "Volumen de Combustible (gal)", label: "Galones (auto)", type: "number", derived: (d) => {
        const p = Number(d["Precio x Galón ($/gal)"] || 0);
        const t = Number(d["Total Combustible ($)"] || 0);
        return p > 0 ? +(t / p).toFixed(2) : 0;
      }},
      { key: "Recorrido por und. de comb. (Km/gal)", label: "Rendimiento (Km/gal) (auto)", type: "number", derived: (d) => {
        const p = Number(d["Precio x Galón ($/gal)"] || 0);
        const t = Number(d["Total Combustible ($)"] || 0);
        const km = Math.max(Number(d["Kms Final (Odómetro)"] || 0) - Number(d["Kms Inicial (Odómetro)"] || 0), 0);
        const gal = p > 0 ? t / p : 0;
        return gal > 0 ? +(km / gal).toFixed(2) : 0;
      }},
      { key: "Gasto peajes ($)", label: "Gasto Peajes ($)", type: "number" },
      { key: "Otros Gastos ($)", label: "Otros Gastos ($)", type: "number" },
      { key: "Gasto Total ($)", label: "Gasto Total ($) (auto)", type: "number", derived: (d) => {
        const t = Number(d["Total Combustible ($)"] || 0);
        const p = Number(d["Gasto peajes ($)"] || 0);
        const o = Number(d["Otros Gastos ($)"] || 0);
        return +(t + p + o).toFixed(2);
      }},
      { key: "Observaciones", label: "Observaciones", type: "textarea" },
    ],
    listColumns: ["Fecha de Salida", "Placa Vehiculo", "Conductor", "Origen", "Destino", "Kms Recorridos", "Total Combustible ($)", "Recorrido por und. de comb. (Km/gal)", "Gasto Total ($)"],
  },
  {
    key: "multas",
    label: "Multas",
    icon: "AlertTriangle",
    fields: [
      { key: "Nro", label: "Nro", type: "number" },
      { key: "Fecha", label: "Fecha", type: "date" },
      { key: "Nro Viaje", label: "Nro Viaje", type: "number" },
      { key: "Placa Vehículo", label: "Placa", type: "select", required: true, dynamicSource: "flota", sourceKey: "Placa Vehiculo", sourceFilter: { key: "Status", equals: "Activo" } },
      { key: "Conductor", label: "Conductor (Técnico)", type: "select", required: true, dynamicSource: "tecnicos", sourceKey: "nombre" },
      { key: "Infracción", label: "Infracción", type: "text" },
      { key: "Importe multa ($)", label: "Importe Multa ($)", type: "number" },
      { key: "Importe pagado ($)", label: "Importe Pagado ($)", type: "number" },
      { key: "Debe ($)", label: "Debe ($)", type: "number" },
      { key: "Fecha de pago", label: "Fecha de Pago", type: "date" },
      { key: "Estado Pago", label: "Estado Pago", type: "select", options: ["Pagado", "Pendiente", "Parcial"] },
      { key: "Evidencias", label: "Evidencias (URL)", type: "url" },
      { key: "Observaciones/ Depósito", label: "Observaciones", type: "textarea" },
    ],
    listColumns: ["Fecha", "Placa Vehículo", "Conductor", "Infracción", "Importe multa ($)", "Importe pagado ($)", "Debe ($)", "Fecha de pago", "Estado Pago", "Evidencias"],
  },
  {
    key: "mantenimiento",
    label: "Mantenimiento",
    icon: "Settings",
    fields: [
      { key: "Nro", label: "Nro (auto)", type: "number", autoGenerate: true },
      { key: "Placa Vehiculo", label: "Vehículo (Placa)", type: "select", required: true, dynamicSource: "flota", sourceKey: "Placa Vehiculo", sourceFilter: { key: "Status", equals: "Activo" } },
      { key: "Taller", label: "Taller", type: "select", dynamicSource: "talleres", sourceKey: "Nombre del Taller" },
      { key: "Fecha Entrada", label: "Fecha Entrada", type: "date" },
      { key: "Fecha Salida", label: "Fecha Salida", type: "date" },
      { key: "Tipo", label: "Tipo", type: "select", options: ["Preventivo", "Correctivo"] },
      { key: "Kilometraje del Odómetro", label: "Km Odómetro", type: "number" },
      { key: "Causas del Mantenimiento", label: "Causas", type: "textarea" },
      { key: "Costo Total ($)", label: "Costo Total ($)", type: "number" },
      { key: "Fecha de Pago", label: "Fecha de Pago", type: "date" },
      { key: "Evidencias", label: "Evidencias (URL)", type: "url" },
      { key: "Observaciones", label: "Observaciones", type: "textarea" },
    ],
    listColumns: ["Nro", "Placa Vehiculo", "Taller", "Fecha Entrada", "Fecha Salida", "Tipo", "Costo Total ($)", "Evidencias"],
  },
];

export const getModule = (key) => MODULES.find((m) => m.key === key);
