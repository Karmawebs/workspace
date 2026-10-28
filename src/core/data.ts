import { db } from "../lib/supabase";
import { cleanSocialMedia } from "../modules/socialMedia";
import type { SupabaseClient } from "@supabase/supabase-js";
// Dynamic entity schemas are validated by the shared form; keep the untyped boundary here.
const records = db as SupabaseClient;
import type { AppKey, Entity, Row } from "./model";
export type Scope = { workspaceId: string; app: AppKey; userId: string };
export async function listRows(def: Entity, scope: Scope, projectId?: string) {
  let q = records.from(def.table).select("*");
  if (def.table === "kw_project_panels") {
    if (!projectId) return [];
    q = q.eq("project_id", projectId);
  } else q = q.eq("workspace_id", scope.workspaceId);
  if (def.appScoped) q = q.eq("app_key", scope.app);
  if (projectId && def.project) q = q.eq("project_id", projectId);
  const { data, error } = await q
    .order(def.order || "created_at", { ascending: !!def.order })
    .limit(1000);
  if (error) throw error;
  return data as unknown as Row[];
}
export async function saveRow(
  def: Entity,
  scope: Scope,
  values: Record<string, unknown>,
  original?: Row,
  projectId?: string,
) {
  const payload: Record<string, unknown> = { ...values };
  if (def.table !== "kw_project_panels")
    payload.workspace_id = scope.workspaceId;
  if (def.appScoped) payload.app_key = scope.app;
  if (projectId && def.project) payload.project_id = projectId;
  if (def.table === "kw_project_resources")
    payload.type = original?.type || "access";
  if (def.table === "kw_journal_entries" && !original)
    payload.author_id = scope.userId;
  if (["kw_tasks", "kw_project_milestones"].includes(def.table))
    payload.completed_at = ["done", "completed"].includes(
      String(payload.status),
    )
      ? original?.completed_at || new Date().toISOString()
      : null;
  if (def.table === "kw_alerts")
    payload.resolved_at =
      payload.status === "resolved"
        ? original?.resolved_at || new Date().toISOString()
        : null;
  if (def.table === "kw_content_items")
    payload.published_at =
      payload.status === "published"
        ? original?.published_at || new Date().toISOString()
        : null;
  let q = original
    ? records
        .from(def.table)
        .update(payload as never)
        .eq("id", original.id)
    : records.from(def.table).insert(payload as never);
  if (original) {
    if (def.table !== "kw_project_panels")
      q = q.eq("workspace_id", scope.workspaceId);
    if (def.appScoped) q = q.eq("app_key", scope.app);
    if (original.updated_at)
      q = q.eq("updated_at", String(original.updated_at));
  }
  const { data, error } = await q.select("*").single();
  if (error)
    throw new Error(
      error.code === "PGRST116"
        ? "El registro cambió o ya no tienes acceso. Recarga antes de guardar."
        : error.message,
    );
  window.dispatchEvent(
    new CustomEvent("kw-records-changed", {
      detail: { table: def.table, workspaceId: scope.workspaceId },
    }),
  );
  return data as unknown as Row;
}
export async function removeRow(def: Entity, scope: Scope, row: Row) {
  let q = records.from(def.table).delete().eq("id", row.id);
  if (def.table !== "kw_project_panels")
    q = q.eq("workspace_id", scope.workspaceId);
  if (def.appScoped) q = q.eq("app_key", scope.app);
  const { error } = await q.select("id").single();
  if (error) throw error;
  if (
    def.table === "kw_content_items" ||
    (def.table === "kw_projects" && scope.app === "social")
  ) {
    void cleanSocialMedia(scope.workspaceId).catch(() => {
      /* Committed deletions stay queued for retry. */
    });
  }
  window.dispatchEvent(
    new CustomEvent("kw-records-changed", {
      detail: { table: def.table, workspaceId: scope.workspaceId },
    }),
  );
}
export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "No se pudo completar la operación.";
}
