import { useRef, useState } from "react";
import { message, saveRow, type Scope } from "./data";
import { entity } from "./entities";
import type { Row } from "./model";

import { urgencyLevels, projectUrgency } from "./urgency";

export function ProjectUrgency({ scope, project, onSave }: {
  scope: Scope; project: Row; onSave: (updated: Row) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const selected = projectUrgency(project.priority).value;

  async function select(priority: string) {
    if (pending.current || selected === priority) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      onSave(await saveRow(entity("projects"), scope, { priority }, project));
    } catch (cause) {
      setError(message(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <div className="project-urgency">
    <div className="urgency-lights" role="group" aria-label="Urgencia del proyecto" aria-busy={busy}>
      {urgencyLevels.map(({ value, label, color }) => <button
        key={value} type="button" className={`urgency-light urgency-${color}`}
        title={`Urgencia ${label.toLowerCase()}`} aria-label={`Urgencia ${label.toLowerCase()}`}
        aria-pressed={selected === value} disabled={busy} onClick={() => void select(value)}
      ><span aria-hidden="true" /></button>)}
    </div>
    {error && <p className="urgency-error error" role="alert">{error}</p>}
  </div>;
}
