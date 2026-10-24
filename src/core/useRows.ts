import { useCallback, useEffect, useState } from "react";
import { listRows, message, type Scope } from "./data";
import type { Entity, Row } from "./model";
export function useRows(def: Entity, scope: Scope, projectId?: string) {
  const [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
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
  return { rows, loading, error, reload };
}
