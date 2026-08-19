import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("fleet_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const formatApiError = (err) => {
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || "Error inesperado";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  return String(d);
};

export const money = (n) => {
  const val = Number(n || 0);
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val);
};

export const numberFmt = (n) => new Intl.NumberFormat("es-EC").format(Number(n || 0));

export default api;
