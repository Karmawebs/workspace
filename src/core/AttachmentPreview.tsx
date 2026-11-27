import { useEffect, useRef, useState } from "react";
import { Download, FileText, X } from "lucide-react";
import { db } from "../lib/supabase";
import { safeUrl } from "./model";
import "./attachment-preview.css";

export type AttachmentSource = {
  name: string;
  storagePath?: string | null;
  url?: string;
  file?: File;
};

export function attachmentKind(name: string, mime = "") {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "jpg" || ext === "jpeg" || ext === "png") return "image";
  if (ext === "docx") return "docx";
  if (ext === "doc") return "doc";
  return "other";
}

async function loadAttachment(source: AttachmentSource, signal: AbortSignal): Promise<Blob> {
  if (source.file) return source.file;
  if (source.storagePath) {
    const { data, error } = await db.storage.from("workspace-task-attachments").download(source.storagePath, {}, { signal });
    if (error || !data) throw error ?? new Error("No se ha podido abrir el archivo.");
    return data;
  }
  const url = safeUrl(source.url);
  if (!url) throw new Error("No se ha encontrado una dirección válida para este archivo.");
  const response = await fetch(url, { signal, credentials: "omit" });
  if (!response.ok) throw new Error("No se ha podido acceder al archivo.");
  return response.blob();
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Safari needs the object URL to remain valid until it starts the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function WordDocument({ blob }: { blob: Blob }) {
  const [html, setHtml] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const container = document.createElement("div");
    void import("docx-preview").then(({ renderAsync }) =>
      renderAsync(blob, container, undefined, {
        renderAltChunks: false, useBase64URL: true, ignoreWidth: true, ignoreHeight: true,
      })
    ).then(() => {
      if (!alive) return;
      container.querySelectorAll("a[href]").forEach(link => link.removeAttribute("href"));
      // The document is presented in a sandbox, without scripts, external
      // resources, access to Workspace, or third-party document services.
      setHtml(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'"><style>html,body{margin:0;background:#e9e9ec}body{overflow-wrap:anywhere}.docx-wrapper{padding:12px!important}.docx-wrapper>section.docx{max-width:100%;box-sizing:border-box;padding:clamp(18px,6vw,64px)!important}img{max-width:100%;height:auto}</style></head><body>${container.innerHTML}</body></html>`);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [blob]);
  if (failed) return <p role="status">No se ha podido previsualizar este documento Word. Puedes descargar el original.</p>;
  return html
    ? <iframe title="Vista previa de Word" sandbox="" srcDoc={html} />
    : <p role="status">Preparando el documento Word…</p>;
}

function LegacyWordDocument({ blob }: { blob: Blob }) {
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let worker: Worker | undefined;
    let timer: number | undefined;
    const stop = () => { worker?.terminate(); window.clearTimeout(timer); };
    const fail = () => { stop(); if (alive) setFailed(true); };
    void blob.arrayBuffer().then(buffer => {
      if (!alive) return;
      worker = new Worker(new URL("./legacy-word.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }) => {
        stop();
        if (!alive) return;
        if (typeof data.text === "string") setContent(data.text);
        else setFailed(true);
      };
      worker.onerror = fail;
      timer = window.setTimeout(fail, 15_000);
      worker.postMessage(buffer, [buffer]);
    }).catch(fail);
    return () => { alive = false; stop(); };
  }, [blob]);
  if (failed) return <p role="status">No se ha podido leer este documento Word antiguo. Puedes descargar el original.</p>;
  if (content === null) return <p role="status">Preparando el documento Word…</p>;
  return <article className="attachment-text-preview"><small>Vista de texto · para ver el formato original, descarga el documento.</small><pre>{content || "El documento no contiene texto visible."}</pre></article>;
}

export function AttachmentPreview({ source, onClose }: { source: AttachmentSource; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void loadAttachment(source, controller.signal).then(file => {
      if (!alive) return;
      const type = attachmentKind(source.name, file.type);
      if (type === "pdf" || type === "image") {
        const mime = type === "pdf" ? "application/pdf" : /\.png$/i.test(source.name) ? "image/png" : "image/jpeg";
        objectUrl = URL.createObjectURL(file.slice(0, file.size, mime));
        setPreviewUrl(objectUrl);
      }
      setBlob(file);
    }).catch(() => {
      if (alive) setError("No se ha podido acceder al archivo. Comprueba que siga disponible e inténtalo de nuevo.");
    });
    return () => { alive = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source]);

  const kind = attachmentKind(source.name, blob?.type);
  return <dialog ref={dialog} className="attachment-preview" aria-label={`Vista previa de ${source.name}`} onCancel={e => { e.preventDefault(); e.stopPropagation(); onClose(); }} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="attachment-preview-shell">
      <div className="attachment-preview-header">
        <div className="attachment-preview-name"><FileText size={19}/><strong title={source.name}>{source.name}</strong></div>
        <div className="attachment-preview-actions">
          <button type="button" className="icon-button" aria-label="Descargar archivo" title="Descargar archivo" disabled={!blob} onClick={()=>blob&&downloadFile(blob,source.name)}><Download size={20}/></button>
          <button type="button" className="icon-button" aria-label="Cerrar vista previa" title="Cerrar vista previa" onClick={onClose}><X size={22}/></button>
        </div>
      </div>
      <div className="attachment-preview-body">
        {error ? <p role="alert">{error}</p> : !blob ? <p role="status">Cargando archivo…</p> :
          kind === "image" && !imageFailed ? <img src={previewUrl} alt={source.name} onError={()=>setImageFailed(true)}/> :
          kind === "pdf" ? <iframe title="Vista previa del PDF" src={previewUrl}/> :
          kind === "docx" ? <WordDocument blob={blob}/> :
          kind === "doc" ? <LegacyWordDocument blob={blob}/> :
          <div className="attachment-preview-fallback"><FileText size={34}/><p>Este archivo no admite vista previa. Puedes descargar el original.</p></div>}
      </div>
    </div>
  </dialog>;
}
