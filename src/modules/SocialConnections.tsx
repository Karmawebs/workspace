import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Link2, X } from "lucide-react";
import { db } from "../lib/supabase";
import {
  platforms,
  accountState,
  type SocialAccount,
  type Platform,
} from "./socialPlatforms";
import "./social-connections.css";

type Account = SocialAccount & { kw_projects: { name: string } | null };
function useAccounts(workspaceId: string, projectId?: string) {
  const [result, setResult] = useState<{ rows?: Account[]; error?: string }>(
    {},
  );
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setResult({});
    async function read() {
      const rows: Account[] = [];
      const pageSize = 250;
      for (let offset = 0; ; offset += pageSize) {
        let query = db
          .from("kw_social_platform_connections")
          .select(
            "id,project_id,platform,external_account_id,username,status,expires_at,connected_at,authorized_scopes,kw_projects!inner(name)",
          )
          .eq("workspace_id", workspaceId);
        if (projectId) query = query.eq("project_id", projectId);
        const { data, error } = await query
          .order("id")
          .range(offset, offset + pageSize - 1)
          .abortSignal(controller.signal);
        if (error) throw error;
        rows.push(...data);
        if (data.length < pageSize) break;
      }
      if (active) setResult({ rows });
    }
    read().catch(() => {
      if (active) setResult({ error: "No se pudieron cargar las conexiones." });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [workspaceId, projectId, retry]);
  return { ...result, reload: () => setRetry((n) => n + 1) };
}
const date = (value: string) =>
  new Date(value).toLocaleDateString("es-ES", { dateStyle: "medium" });
function AccountDetails({ account }: { account: Account }) {
  return (
    <div className="social-account">
      <strong>@{account.username.replace(/^@/, "")}</strong>
      <span>{accountState(account)}</span>
      <details>
        <summary>Gestionar cuenta</summary>
        <dl>
          <dt>Conectada el</dt>
          <dd>{date(account.connected_at)}</dd>
          <dt>Permisos autorizados</dt>
          <dd>
            {account.authorized_scopes.join(", ") || "Sin permisos registrados"}
          </dd>
          {account.expires_at && (
            <>
              <dt>Caducidad</dt>
              <dd>{date(account.expires_at)}</dd>
            </>
          )}
        </dl>
      </details>
    </div>
  );
}
function Accounts({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId?: string;
}) {
  const { rows, error, reload } = useAccounts(workspaceId, projectId);
  if (error)
    return (
      <p role="alert">
        {error}{" "}
        <button type="button" onClick={reload}>
          Reintentar
        </button>
      </p>
    );
  if (!rows) return <p role="status">Cargando conexiones…</p>;
  if (projectId)
    return (
      <div className="social-platforms">
        {(Object.keys(platforms) as Platform[]).map((platform) => {
          const accounts = rows.filter((a) => a.platform === platform);
          const upcoming = platforms[platform].availability === "next_stage";
          return (
            <section key={platform}>
              <h3>{platforms[platform].name}</h3>
              {accounts.length ? (
                accounts.map((account) => (
                  <AccountDetails key={account.id} account={account} />
                ))
              ) : (
                <>
                  <p>{upcoming ? "Sin conectar" : "Próximamente"}</p>
                  {upcoming && (
                    <div>
                      <button type="button" disabled>
                        Conectar
                      </button>
                      <small>Disponible en la etapa 2.2.</small>
                    </div>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
    );
  if (!rows.length)
    return (
      <div className="card empty">
        <Link2 size={26} aria-hidden="true" />
        <h2>Todavía no hay cuentas vinculadas</h2>
        <p>
          Las cuentas de Instagram, Facebook y TikTok aparecerán aquí agrupadas
          por proyecto.
        </p>
      </div>
    );
  const groups = new Map<string, Account[]>();
  for (const account of rows) {
    const group = groups.get(account.project_id);
    if (group) group.push(account);
    else groups.set(account.project_id, [account]);
  }
  return (
    <div className="social-platforms">
      {Array.from(groups, ([id, accounts]) => (
        <section className="card" key={id}>
          <h2>
            <Link to={`/social/projects/${id}`}>
              {accounts[0].kw_projects?.name || "Abrir proyecto"}
            </Link>
          </h2>
          {accounts.map((account) => (
            <div key={account.id}>
              <h3>{platforms[account.platform].name}</h3>
              <AccountDetails account={account} />
              <small>Conectada el {date(account.connected_at)}</small>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
export function SocialConnections({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  return (
    <section className="entity-page">
      <header className="section-header">
        <h1>Conexiones</h1>
      </header>
      {canManage ? (
        <Accounts workspaceId={workspaceId} />
      ) : (
        <p>
          Solo los administradores del Workspace pueden consultar las conexiones
          sociales.
        </p>
      )}
    </section>
  );
}
export function SocialConnectionsDialog({
  workspaceId,
  projectId,
  projectName,
  canManage,
  onClose,
}: {
  workspaceId: string;
  projectId: string;
  projectName: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      className="editor social-connections-dialog"
      ref={dialog}
      aria-labelledby="social-connections-title"
      onCancel={onClose}
    >
      <header>
        <div>
          <span className="eyebrow">{projectName}</span>
          <h2 id="social-connections-title">Conexiones</h2>
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          className="icon-button"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      {canManage ? (
        <Accounts workspaceId={workspaceId} projectId={projectId} />
      ) : (
        <p>
          Solo los administradores del Workspace pueden consultar las conexiones
          sociales.
        </p>
      )}
    </dialog>
  );
}
