import { useRef, useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import { saveRow, message, type Scope } from "../core/data";
import { entity } from "../core/entities";

export function KarmaQuickTask({ scope, projectId, onCreated }: {
  scope: Scope; projectId: string; onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (!value || saving.current) return;
    saving.current = true;
    setBusy(true); setError("");
    try {
      await saveRow(entity("tasks"), scope, { title: value }, undefined, projectId);
      setTitle(""); onCreated();
    } catch (failure) { setError(message(failure)); }
    finally { saving.current = false; setBusy(false); }
  }
  return <div className="karma-quick-task">
    <form onSubmit={submit} aria-label="Creación rápida de tarea" aria-busy={busy}>
      <input aria-label="Nueva tarea" placeholder="Añadir una tarea…" value={title}
        onChange={event => setTitle(event.target.value)} disabled={busy} maxLength={300}
        autoComplete="off" enterKeyHint="send"/>
      <button type="submit" aria-label="Añadir tarea" disabled={busy || !title.trim()}><ArrowUp size={20}/></button>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}
