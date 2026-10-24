import type { Database } from "../lib/database.types";
export type AppKey = "work" | "social" | "care";
export type Table = keyof Database["public"]["Tables"];
export type Row = { id: string; [key: string]: unknown };
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "email"
    | "url"
    | "date"
    | "datetime-local"
    | "select"
    | "number"
    | "checkbox";
  required?: boolean;
  options?: readonly string[];
  relation?: "projects" | "clients" | "members" | "care_sites";
  default?: string | boolean | number;
  help?: string;
};
export type Entity = {
  table: Table;
  title: string;
  singular: string;
  primary: string;
  fields: Field[];
  appScoped?: boolean;
  project?: boolean;
  projectRequired?: boolean;
  archive?: boolean;
  order?: string;
};
export const text = (value: unknown) => (value == null ? "" : String(value));
export const label: Record<string, string> = {
  active: "Activo",
  paused: "En pausa",
  completed: "Completado",
  pending: "Pendiente",
  in_progress: "En curso",
  done: "Completado",
  cancelled: "Cancelado",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
  low: "Baja",
  open: "Abierta",
  resolved: "Resuelta",
  info: "Información",
  warning: "Aviso",
  critical: "Crítica",
  draft: "Borrador",
  review: "En revisión",
  approved: "Aprobado",
  scheduled: "Programado",
  published: "Publicado",
  meeting: "Reunión",
  content_session: "Sesión de contenido",
  event: "Evento",
  member: "Miembro",
  admin: "Administrador",
  owner: "Propietario",
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Error",
};
export const pretty = (value: unknown) => label[text(value)] || text(value);
export function safeUrl(value: unknown) {
  try {
    const u = new URL(text(value));
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function localInput(value: unknown) {
  if (!value) return "";
  const d = new Date(text(value));
  return Number.isNaN(d.getTime())
    ? ""
    : new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
}
export function dayKey(value: string | Date) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dateLabel(value: unknown) {
  if (!value) return "";
  const d = new Date(text(value));
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat("es", {
        dateStyle: "medium",
        ...(text(value).includes("T") ? { timeStyle: "short" as const } : {}),
      }).format(d);
}

export const newLabel = (singular: string) =>
  `${["tarea", "entrada", "alerta", "conexión"].includes(singular) ? "Nueva" : "Nuevo"} ${singular}`;
