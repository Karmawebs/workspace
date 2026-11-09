import { useEffect, useRef, useState } from "react";
import { db } from "../lib/supabase";
import type { MediaItem } from "./SocialMediaPicker";
import { signedMediaUrl } from "./socialMedia";
import {
  formatError,
  geometryError,
} from "../../supabase/functions/_shared/instagram-formats";
import { socialLabels } from "./socialContent";

type Account = { id: string; username: string; project_id: string };
type Preview = { url: string; video: boolean };
export type Confirmation = { connectionId: string; attemptId: string };
export async function publishAction(body: Record<string, unknown>) {
  const { data, error } = await db.functions.invoke(
    "social-instagram-publish",
    { body },
  );
  if (error) {
    const reason = await error.context?.json?.().catch(() => null);
    throw new Error(
      reason?.error ||
        "No se pudo confirmar el resultado. Abre el contenido para consultar su estado.",
    );
  }
  return data;
}
async function inspect(url: string, video: boolean, format: string) {
  const el = video ? document.createElement("video") : new Image();
  return await new Promise<string>((resolve) => {
    function finish(value: string) {
      clearTimeout(timer);
      el.onload = el.onerror = null;
      if (el instanceof HTMLVideoElement) {
        el.onloadedmetadata = null;
        el.removeAttribute("src");
        el.load();
      }
      resolve(value);
    }
    const timer = setTimeout(
      () => finish("No se pudo comprobar el archivo."),
      15000,
    );
    el.onerror = () => finish("No se pudo leer el archivo para Instagram.");
    if (el instanceof HTMLVideoElement) {
      el.preload = "metadata";
      el.onloadedmetadata = () =>
        finish(
          geometryError(
            format,
            true,
            el.videoWidth,
            el.videoHeight,
            el.duration,
          ),
        );
    } else
      el.onload = () =>
        finish(
          geometryError(format, false, el.naturalWidth, el.naturalHeight, 0),
        );
    el.src = url;
  });
}
export function InstagramPublishControls({
  projectId,
  contentId,
  items,
  format,
  caption,
  blocked,
  onConfirm,
  failed,
}: {
  projectId: string;
  contentId: string;
  items: MediaItem[];
  format: string;
  caption: string;
  blocked: boolean;
  failed: boolean;
  onConfirm: (v: Confirmation) => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]),
    [chosen, choose] = useState("");
  const [accountError, setAccountError] = useState(""),
    [media, setMedia] = useState<{
      items: MediaItem[];
      format: string;
      previews: Preview[];
      error: string;
    }>();
  const [business, setBusiness] = useState(""),
    [storyError, setStoryError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    setAccounts([]);
    choose("");
    setAccountError("");
    if (projectId)
      void (async () => {
        const { data, error } = await db
          .from("kw_social_platform_connections")
          .select("id,username,project_id,expires_at,authorized_scopes")
          .eq("project_id", projectId)
          .eq("platform", "instagram")
          .eq("status", "connected");
        if (!active) return;
        if (error) {
          setAccountError("No se pudieron cargar las cuentas.");
          return;
        }
        const valid = (data || []).filter(
          (a) =>
            a.authorized_scopes.includes("instagram_content_publish") &&
            (!a.expires_at || Date.parse(a.expires_at) > Date.now()),
        );
        setAccounts(valid);
        choose(valid[0]?.id || "");
      })();
    return () => {
      active = false;
    };
  }, [projectId]);
  const account = accounts.find(
    (a) => a.id === chosen && a.project_id === projectId,
  );
  useEffect(() => {
    let active = true;
    setBusiness("");
    setStoryError("");
    if (format === "story" && account)
      void publishAction({
        action: "storyEligibility",
        projectId,
        contentId,
        connectionId: account.id,
      })
        .then((r) => {
          if (active) {
            if (r.eligible) setBusiness(account.id);
            else
              setStoryError(
                "Historias pendientes de verificar. Confirma que el tipo de cuenta en Instagram es Empresa.",
              );
          }
        })
        .catch(() => {
          if (active)
            setStoryError(
              "No se pudo verificar la cuenta Business para historias.",
            );
        });
    return () => {
      active = false;
    };
  }, [format, account, projectId, contentId]);
  const files = items.map((i) => ({
    mime_type: i.record?.mime_type || i.file?.type || "",
    size: i.record?.size || i.file?.size || 0,
  }));
  const basic = formatError(format, files, caption);
  const compatibleFiles = !formatError(format, files, "");
  useEffect(() => {
    let active = true;
    const local: string[] = [];
    setMedia(undefined);
    if (compatibleFiles && account)
      void (async () => {
        const previews: Preview[] = [];
        for (const item of items) {
          if (!active) return;
          const url = item.file
            ? URL.createObjectURL(item.file)
            : await signedMediaUrl(item.record!.storage_path);
          if (item.file) local.push(url);
          const video = (
            item.file?.type ||
            item.record?.mime_type ||
            ""
          ).startsWith("video/");
          const error = await inspect(url, video, format);
          if (error) throw new Error(error);
          previews.push({ url, video });
        }
        if (active) setMedia({ items, format, previews, error: "" });
      })().catch((e) => {
        if (active)
          setMedia({
            items,
            format,
            previews: [],
            error: e instanceof Error ? e.message : "Archivo no disponible.",
          });
      });
    return () => {
      active = false;
      local.forEach(URL.revokeObjectURL);
    };
  }, [items, format, compatibleFiles, account]);
  const current =
    media?.items === items && media?.format === format ? media : undefined;
  const problem = !account
    ? accountError ||
      "Selecciona un proyecto con una cuenta de Instagram conectada."
    : basic ||
      current?.error ||
      (format === "story" && business !== chosen
        ? storyError || "Verificando cuenta Business…"
        : "") ||
      (!current ? "Comprobando archivos…" : "");
  return (
    <div className="ig-publish">
      <label>
        Cuenta de destino
        <select
          value={account?.id || ""}
          onChange={(e) => choose(e.target.value)}
          disabled={blocked}
        >
          {!account && <option value="">Sin cuenta disponible</option>}
          {accounts
            .filter((a) => a.project_id === projectId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                Instagram · @{a.username} · Conectada
              </option>
            ))}
        </select>
      </label>
      {problem && <small>{problem}</small>}
      <button
        type="button"
        disabled={blocked || !!problem}
        onClick={(e) => {
          if (e.currentTarget.form?.reportValidity())
            dialog.current?.showModal();
        }}
      >
        {failed ? "Reintentar publicación" : "Publicar ahora"}
      </button>
      <dialog
        ref={dialog}
        className="editor ig-confirm"
        aria-label="Confirmar publicación"
        onCancel={(e) => e.stopPropagation()}
      >
        <h2>Publicar en Instagram</h2>
        <p>
          @{account?.username} · {socialLabels[format]}
        </p>
        <div className="ig-preview">
          {current?.previews.map(({ url, video }) =>
            video ? (
              <video
                key={url}
                src={url}
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <img key={url} src={url} alt="Vista previa de la publicación" />
            ),
          )}
        </div>
        <p>
          {format === "story"
            ? "Las historias se envían sin copy."
            : caption || "Sin copy"}
        </p>
        <footer>
          <button type="button" onClick={() => dialog.current?.close()}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={blocked || !!problem}
            onClick={() => {
              if (account) {
                dialog.current?.close();
                onConfirm({
                  connectionId: account.id,
                  attemptId: crypto.randomUUID(),
                });
              }
            }}
          >
            Confirmar publicación
          </button>
        </footer>
      </dialog>
    </div>
  );
}
