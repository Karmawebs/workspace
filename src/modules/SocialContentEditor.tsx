import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { db } from "../lib/supabase";
import { message, type Scope } from "../core/data";
import { localInput, safeUrl, text, type Row } from "../core/model";

import type { Database } from "../lib/database.types";
import {
  fileUrls,
  formats,
  statuses,
  socialLabels as labels,
} from "./socialContent";

export function SocialContentEditor({
  scope,
  original,
  projectId,
  onClose,
  onSave,
}: {
  scope: Scope;
  original?: Row;
  projectId?: string;
  onClose: () => void;
  onSave: (row: Row) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [urls, setUrls] = useState<string[]>(() => {
      const raw = fileUrls(original?.file_urls);
      return raw.length ? raw : [""];
    });
  const [selectedProject, setSelectedProject] = useState(
    projectId || text(original?.project_id),
  );
  const [format, setFormat] = useState(text(original?.content_type) || "post");
  const [ready, setReady] = useState(!!projectId);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => before?.focus();
  }, []);
  useEffect(() => {
    if (projectId) return;
    let alive = true;
    db.from("kw_projects")
      .select("id,name")
      .eq("workspace_id", scope.workspaceId)
      .eq("app_key", "social")
      .order("name")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(error.message);
        else {
          setProjects(data || []);
          setReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [scope.workspaceId, projectId]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const title = text(fd.get("title")).trim(),
      description = text(fd.get("description")).trim(),
      content_type = text(fd.get("content_type")) || "post",
      status = text(fd.get("status")) || "draft",
      scheduled = text(fd.get("scheduled_at")).trim();
    if (!title) {
      setError("El título es obligatorio.");
      return;
    }
    const cleanUrls = urls.map((v) => v.trim()).filter(Boolean);
    if (cleanUrls.some((v) => !safeUrl(v))) {
      setError("Utiliza URLs http(s) válidas para los archivos.");
      return;
    }
    setBusy(true);
    try {
      const payload: Database["public"]["Tables"]["kw_content_items"]["Insert"] =
        {
          workspace_id: scope.workspaceId,
          project_id: selectedProject || null,
          title,
          description: description || null,
          content_type,
          status,
          scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
          file_urls: cleanUrls,
          published_at:
            status === "published"
              ? text(original?.published_at) || new Date().toISOString()
              : null,
          updated_at: new Date().toISOString(),
        };
      let query = original?.id
        ? db
            .from("kw_content_items")
            .update(payload)
            .eq("id", text(original.id))
            .eq("workspace_id", scope.workspaceId)
        : db.from("kw_content_items").insert(payload);
      if (original?.updated_at)
        query = query.eq("updated_at", text(original.updated_at));
      const { data, error } = await query.select("*").single();
      if (error)
        throw new Error(
          error.code === "PGRST116"
            ? "El registro cambió o ya no tienes acceso. Recarga antes de guardar."
            : error.message,
        );
      window.dispatchEvent(
        new CustomEvent("kw-records-changed", {
          detail: { table: "kw_content_items", workspaceId: scope.workspaceId },
        }),
      );
      onSave(data);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="editor social-content-editor"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">SOCIAL / CONTENIDO</span>
            <h2>{original ? "Editar contenido" : "Nuevo contenido"}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        <fieldset className="form-fields social-content-fields" disabled={busy}>
          {!projectId && (
            <label>
              Cliente / proyecto
              <select
                name="project_id"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Título *
            <input name="title" defaultValue={text(original?.title)} required />
          </label>
          <label>
            Copy
            <textarea
              name="description"
              defaultValue={text(original?.description)}
              rows={6}
            />
          </label>
          <label>
            Formato
            <select
              className={`social-format-select ${format}`}
              name="content_type"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              {!formats.some((v) => v === format) && (
                <option value={format}>{format}</option>
              )}
              {formats.map((v) => (
                <option key={v} value={v}>
                  {labels[v]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select
              name="status"
              defaultValue={text(original?.status) || "draft"}
            >
              {Boolean(original?.status) &&
                !statuses.some((v) => v === original?.status) && (
                  <option value={text(original?.status)}>
                    {text(original?.status)}
                  </option>
                )}
              {statuses.map((v) => (
                <option key={v} value={v}>
                  {labels[v]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Publicación prevista
            <input
              name="scheduled_at"
              type="datetime-local"
              defaultValue={localInput(original?.scheduled_at)}
            />
          </label>
          <div className="social-file-urls">
            <span className="social-field-label">URL de archivo</span>
            {urls.map((url, i) => (
              <div className="social-url-row" key={i}>
                <input
                  aria-label={`URL de archivo ${i + 1}${i === 0 ? " (portada)" : ""}`}
                  type="url"
                  value={url}
                  placeholder="https://drive.google.com/…"
                  onChange={(e) =>
                    setUrls((v) =>
                      v.map((x, j) => (j === i ? e.target.value : x)),
                    )
                  }
                />
                {urls.length > 1 && (
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Eliminar URL ${i + 1}`}
                    onClick={() => setUrls((v) => v.filter((_, j) => j !== i))}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="social-add-url"
              onClick={() => setUrls((v) => [...v, ""])}
            >
              <Plus size={14} /> Añadir URL
            </button>
          </div>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            className="ghost"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button disabled={busy || !ready}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
