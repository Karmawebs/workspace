import { useCallback, useEffect, useState } from "react";
import { listRows, message, type Scope } from "./data";
import type { Entity, Row } from "./model";
import { db } from "../lib/supabase";
export function useRows(def: Entity, scope: Scope, projectId?: string) {
  const [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (scope.app !== "karma" || def.table !== "kw_tasks") return;
    const channel = db.channel(`karma-tasks:${scope.workspaceId}:${projectId || "all"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "kw_tasks",
        filter: `workspace_id=eq.${scope.workspaceId}` }, ({ new: task }) => {
        if (task.app_key === "karma" && (!projectId || task.project_id === projectId)) reload();
      }).subscribe((status) => { if (status === "SUBSCRIBED") reload(); });
    const focus = () => reload();
    window.addEventListener("focus", focus);
    return () => { void db.removeChannel(channel); window.removeEventListener("focus", focus); };
  }, [def.table, scope.app, scope.workspaceId, projectId, reload]);
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (
        detail.workspaceId === scope.workspaceId &&
        (detail.table === def.table || detail.table === "kw_projects")
      )
        reload();
    };
    window.addEventListener("kw-records-changed", changed);
    return () => window.removeEventListener("kw-records-changed", changed);
  }, [def.table, scope.workspaceId, reload]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setRows([]);
    setError("");
    listRows(def, scope, projectId)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(message(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [def, scope.workspaceId, scope.app, projectId, revision]);
  useEffect(() => {
    if (
      def.table !== "kw_content_items" ||
      !rows.some((row) =>
        ["scheduled", "publishing"].includes(String(row.publication_state)),
      )
    )
      return;
    const timer = window.setTimeout(reload, 15000);
    return () => clearTimeout(timer);
  }, [rows, def.table, reload]);
  return { rows, loading, error, reload };
}
