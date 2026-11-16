import { useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { entity } from "./entities";
import { message, saveRow, type Scope } from "./data";
import { useRows } from "./useRows";
import { dateLabel, text } from "./model";

export function WorkJournal({ scope, projectId }: { scope: Scope; projectId: string }) {
  const def = entity("journal");
  const { rows, loading, error, reload } = useRows(def, scope, projectId);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [expandedEntries,setExpandedEntries] = useState<string[]>([]);

  const entries = [...rows].sort((a, b) => {
    const aCreated = text(a.created_at);
    const bCreated = text(b.created_at);
    const createdOrder = bCreated.localeCompare(aCreated);
    if (createdOrder !== 0) return createdOrder;

    const aDate = text(a.entry_date);
    const bDate = text(b.entry_date);
    return bDate.localeCompare(aDate);
  });

  async function addEntry() {
    const note = body.trim();
    if (!note || busy) return;
    setBusy(true);
    setFailure("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      await saveRow(
        def,
        scope,
        { title: note.slice(0, 80), body: note, entry_date: today },
        undefined,
        projectId,
      );
      setBody("");
      reload();
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card section-card work-journal">
      <header className="section-header work-journal-header">
        <div>
          <h2>Diario <span className="count">{entries.length}</span></h2>
          <p className="muted">Lo que pasa en el proyecto, se queda aquí.</p>
        </div>
      </header>

      <textarea
        className="work-journal-input"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Una actualización, una decisión, una idea…"
        rows={4}
      />
      <div className="work-journal-compose-actions">
        <button onClick={addEntry} disabled={busy || !body.trim()}>
          <Plus size={17} /> {busy ? "Guardando…" : "Añadir entrada"}
        </button>
      </div>

      {(error || failure) && <div className="error">{error || failure}</div>}

      <div className="work-journal-entries">
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : entries.length === 0 ? (
          <p className="muted work-journal-empty">Todavía no hay entradas.</p>
        ) : (
          entries.map((row) => (
            <article className="work-journal-entry" key={text(row.id)}>
              {scope.app==="social" ? <>
                <button type="button" className="social-journal-entry-toggle" aria-expanded={expandedEntries.includes(text(row.id))} onClick={()=>setExpandedEntries(current=>current.includes(text(row.id))?current.filter(id=>id!==text(row.id)):[...current,text(row.id)])}>
                  <span><time>{dateLabel(row.entry_date || row.created_at)}</time><strong>{text(row.body || row.title).replace(/\s+/g," ").slice(0,75)}{text(row.body || row.title).length>75?"…":""}</strong></span>
                  <ChevronDown size={17} className={expandedEntries.includes(text(row.id))?"is-open":""}/>
                </button>
                {expandedEntries.includes(text(row.id))&&<p>{text(row.body || row.title)}</p>}
              </> : <>
                <time>{dateLabel(row.entry_date || row.created_at)}</time>
                <p>{text(row.body || row.title)}</p>
              </>}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
