import { text, type Row } from "../core/model";
export type CareAction = {
  type: "update_plugins" | "update_themes" | "update_wordpress";
  target: string | null;
  name: string;
};
export function actionState(job: Row): string {
  if (job.status === "pending") return "Pendiente";
  if (job.status === "succeeded") return "Completado";
  if (job.status === "cancelled") return "Cancelado";
  if (job.status === "failed") {
    const result = job.result as {
      rolled_back?: { restored?: boolean }[];
    } | null;
    return result?.rolled_back?.some((r) => r.restored === true)
      ? "Rollback realizado"
      : "Error";
  }
  const stages: Record<string, string> = {
    preflight: "Preparando",
    backup: "Preparando",
    updating: "Actualizando",
    verifying: "Verificando",
    health: "Comprobando web",
    rollback: "Restaurando",
  };
  return stages[text(job.progress_stage)] || "Preparando";
}
export function actionName(job: Row): string {
  const payload = job.requested_payload as {
    target_name?: string;
    targets?: string[];
  } | null;
  return (
    payload?.target_name ||
    text(job.target_slug) ||
    payload?.targets?.join(", ") ||
    (job.action_type === "update_wordpress"
      ? "WordPress"
      : "Actualización anterior")
  );
}
export function actionSummary(job: Row): string {
  const result = job.result as { summary?: string } | null;
  return job.status === "running"
    ? text(job.progress_message)
    : result?.summary || "";
}
export function agentReady(version: unknown): boolean {
  return (
    typeof version === "string" &&
    /^\d+\.\d+\.\d+$/.test(version) &&
    (Number(version.split(".")[0]) > 0 || Number(version.split(".")[1]) >= 8)
  );
}
