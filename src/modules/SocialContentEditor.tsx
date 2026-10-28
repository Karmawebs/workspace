import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { db } from "../lib/supabase";
import { message, type Scope } from "../core/data";
import { localInput, safeUrl, text, type Row } from "../core/model";

import { SocialMediaPicker, type MediaItem } from "./SocialMediaPicker";
import {
  cleanSocialMedia,
  getSocialUploadLimit,
  discardReservation,
  loadContentFiles,
  reserveMedia,
  uploadMedia,
} from "./socialMedia";
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
    [items, setItems] = useState<MediaItem[]>([]);
  const [uploadLimit, setUploadLimit] = useState<number>();
  const [limitError, setLimitError] = useState("");
  const [filesReady, setFilesReady] = useState(!original?.id);
  const contentId = useRef(text(original?.id) || crypto.randomUUID());
  const uploadController = useRef<AbortController | null>(null);
  const reservations = useRef(new Set<string>());
  const legacyUrls = fileUrls(original?.file_urls);
  useEffect(() => {
    let alive = true;
    void getSocialUploadLimit()
      .then((limit) => {
        if (alive) setUploadLimit(limit);
      })
      .catch(() => {
        if (alive)
          setLimitError(
            "No se pudo comprobar el límite de Storage. Recarga para añadir archivos.",
          );
      });
    if (original?.id)
      void loadContentFiles(scope.workspaceId, text(original.id))
        .then((files) => {
          if (alive) {
            setItems(
              files.map((record) => ({
                key: record.id,
                record,
                status: "saved",
                progress: 100,
              })),
            );
            setFilesReady(true);
          }
        })
        .catch((e) => {
          if (alive) setError(message(e));
        });
    void cleanSocialMedia(scope.workspaceId).catch(() => {
      /* Durable queue retries on the next visit. */
    });
    return () => {
      alive = false;
      uploadController.current?.abort();
      void Promise.all(
        [...reservations.current].map((id) =>
          discardReservation(id, scope.workspaceId),
        ),
      )
        .then(() => cleanSocialMedia(scope.workspaceId))
        .catch(() => {
          /* Expiring reservations remain tracked. */
        });
    };
  }, [original?.id, scope.workspaceId]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
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
    if (!filesReady) return;
    setBusy(true);
    const controller = new AbortController();
    uploadController.current = controller;
    const next = items.map((item) => ({ ...item }));
    const update = () => setItems(next.map((item) => ({ ...item })));
    try {
      for (const item of next) {
        if (!item.file || item.status === "uploaded") continue;
        if (controller.signal.aborted) break;
        const recovering = item.status === "error";
        item.status = "uploading";
        item.error = undefined;
        update();
        try {
          if (!item.record) {
            item.record = await reserveMedia(scope.workspaceId, item.file);
            reservations.current.add(item.record.id);
          }
          await uploadMedia(
            item.file,
            item.record,
            (progress) => {
              item.progress = progress;
              update();
            },
            controller.signal,
            recovering,
          );
          item.status = "uploaded";
        } catch (e) {
          item.status = "error";
          item.error = message(e);
        }
        update();
      }
      if (
        controller.signal.aborted ||
        next.some((item) => !["saved", "uploaded"].includes(item.status))
      )
        throw new Error(
          "No se ha guardado el contenido. Reintenta Guardar o elimina los archivos con error.",
        );
      const { data, error } = await db.rpc("kw_save_social_content", {
        p_workspace_id: scope.workspaceId,
        p_content_id: contentId.current,
        p_expected_updated_at: original?.id ? text(original.updated_at) : null,
        p_values: {
          title,
          description,
          project_id: selectedProject || null,
          content_type,
          status,
          scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
        },
        p_file_ids: next.map((item) => item.record!.id),
      });
      if (error) throw new Error(error.message);
      if (!data)
        throw new Error(
          "No se pudo confirmar el guardado. Recarga antes de reintentar.",
        );
      for (const item of next)
        if (item.record) reservations.current.delete(item.record.id);
      // Removed staged files are also queued, but only after the save commits.
      for (const id of [...reservations.current]) {
        try {
          await discardReservation(id, scope.workspaceId);
          reservations.current.delete(id);
        } catch {
          /* tracked until expiration */
        }
      }
      void cleanSocialMedia(scope.workspaceId).catch(() => {
        /* The durable queue retains failed deletions. */
      });
      window.dispatchEvent(
        new CustomEvent("kw-records-changed", {
          detail: { table: "kw_content_items", workspaceId: scope.workspaceId },
        }),
      );
      onSave(data);
    } catch (e) {
      setError(message(e));
    } finally {
      uploadController.current = null;
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
          {!filesReady && <p role="status">Cargando archivos…</p>}
          <SocialMediaPicker
            items={items}
            onChange={setItems}
            disabled={busy || !filesReady || !uploadLimit}
            maximum={uploadLimit}
          />
          {limitError && (
            <p className="error" role="alert">
              {limitError}
            </p>
          )}
          {legacyUrls.length > 0 && (
            <details className="social-legacy-files">
              <summary>Archivos anteriores ({legacyUrls.length})</summary>
              <p>
                Se conservan los enlaces existentes. Los archivos nuevos se
                guardan de forma privada.
              </p>
              {legacyUrls.map(
                (url, i) =>
                  safeUrl(url) && (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Archivo anterior {i + 1}
                    </a>
                  ),
              )}
            </details>
          )}
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
          {busy && items.some((item) => item.status === "uploading") && (
            <button
              type="button"
              className="ghost"
              onClick={() => uploadController.current?.abort()}
            >
              Detener subida
            </button>
          )}
          <button disabled={busy || !ready || !filesReady}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
