import { useEffect, useRef, useState } from "react";
import { FileText, KeyRound, Paperclip, Plus, Trash2, Users, X } from "lucide-react";
import { db } from "../lib/supabase";
import { EntityView } from "../core/EntityView";
import { WorkJournal } from "../core/WorkJournal";
import { message, type Scope } from "../core/data";
import { text, type Row } from "../core/model";
import "./karma-internal.css";

type ProjectFile = { id:string; storage_path:string; original_filename:string; mime_type:string; size:number; created_at:string };
type Contact = { id:string; name:string; company:string|null; role:string|null; email:string|null; phone:string|null; contact_type:string; url:string|null; notes:string|null };
type Modal = "files" | "credentials" | "contacts" | null;
const records = db as any;

export function KarmaInternal({ scope }: { scope: Scope }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<Row>();
  const [modal, setModal] = useState<Modal>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [fileUrls, setFileUrls] = useState<Record<string,string>>({});
  const [preview, setPreview] = useState<{file:ProjectFile;url:string}>();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactEdit, setContactEdit] = useState<Contact>();
  const [fileBusy, setFileBusy] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [accessCount, setAccessCount] = useState(0);
  const [error, setError] = useState("");

  const loadProject = async () => {
    const { data, error } = await records.from("kw_projects").select("*").eq("workspace_id", scope.workspaceId).eq("app_key", "karma").contains("metadata", { internal_home: true }).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("No se ha encontrado el espacio interno de Karma.");
    setProject(data as Row);
    return data as Row;
  };

  const loadFiles = async (projectId = text(project?.id)) => {
    if (!projectId) return;
    const { data, error } = await records.from("kw_project_files").select("id,storage_path,original_filename,mime_type,size,created_at").eq("workspace_id", scope.workspaceId).eq("project_id", projectId).eq("app_key", "karma").order("created_at", { ascending:false });
    if (error) throw error;
    setFiles((data || []) as ProjectFile[]);
  };

  const loadContacts = async () => {
    const { data, error } = await records.from("kw_internal_contacts").select("id,name,company,role,email,phone,contact_type,url,notes").eq("workspace_id", scope.workspaceId).order("created_at", { ascending:false });
    if (error) throw error;
    setContacts((data || []) as Contact[]);
  };

  const loadAccessCount = async (projectId = text(project?.id)) => {
    if (!projectId) return;
    const { count, error } = await records.from("kw_project_resources").select("id", { count:"exact", head:true }).eq("workspace_id", scope.workspaceId).eq("project_id", projectId).eq("app_key", "karma").eq("type", "access");
    if (error) throw error;
    setAccessCount(count || 0);
  };

  useEffect(() => {
    let active = true;
    loadProject().then(async (row) => {
      if (!active) return;
      await Promise.all([loadFiles(text(row.id)), loadContacts(), loadAccessCount(text(row.id))]);
    }).catch((e) => active && setError(message(e)));
    return () => { active = false; };
  }, [scope.workspaceId]);

  useEffect(() => {
    if (modal !== "files" || !files.length) return;
    let active = true;
    Promise.all(files.map(async (file) => {
      const { data, error } = await db.storage.from("karma-internal-files").createSignedUrl(file.storage_path, 1800);
      return error || !data?.signedUrl ? null : [file.id, data.signedUrl] as const;
    })).then((entries) => {
      if (!active) return;
      setFileUrls(Object.fromEntries(entries.filter(Boolean) as readonly (readonly [string,string])[]));
    }).catch((e) => active && setError(message(e)));
    return () => { active = false; };
  }, [modal, files]);

  const uploadFiles = async (selected: FileList | null) => {
    if (!selected?.length || !project) return;
    setFileBusy(true); setError("");
    try {
      for (const file of Array.from(selected)) {
        if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} supera el límite de 50 MB.`);
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `${scope.workspaceId}/${project.id}/${crypto.randomUUID()}-${safe}`;
        const { error: uploadError } = await db.storage.from("karma-internal-files").upload(path, file, { contentType:file.type || "application/octet-stream" });
        if (uploadError) throw uploadError;
        const { error: rowError } = await records.from("kw_project_files").insert({ workspace_id:scope.workspaceId, project_id:project.id, app_key:"karma", storage_path:path, original_filename:file.name, mime_type:file.type || "application/octet-stream", size:file.size });
        if (rowError) { await db.storage.from("karma-internal-files").remove([path]); throw rowError; }
      }
      await loadFiles();
    } catch (e) { setError(message(e)); }
    finally { setFileBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  };

  const openFile = async (file: ProjectFile) => {
    const existing = fileUrls[file.id];
    if (existing) { setPreview({ file, url:existing }); return; }
    const { data, error } = await db.storage.from("karma-internal-files").createSignedUrl(file.storage_path, 1800);
    if (error) { setError(message(error)); return; }
    setFileUrls((current) => ({ ...current, [file.id]:data.signedUrl }));
    setPreview({ file, url:data.signedUrl });
  };

  const deleteFile = async (file: ProjectFile) => {
    if (!project) return;
    setFileBusy(true); setError("");
    try {
      const { error: storageError } = await db.storage.from("karma-internal-files").remove([file.storage_path]);
      if (storageError) throw storageError;
      const { error: rowError } = await records.from("kw_project_files").delete().eq("id", file.id).eq("workspace_id", scope.workspaceId).eq("project_id", project.id).eq("app_key", "karma");
      if (rowError) throw rowError;
      if (preview?.file.id === file.id) setPreview(undefined);
      await loadFiles();
    } catch (e) { setError(message(e)); }
    finally { setFileBusy(false); }
  };

  const saveContact = async (form: HTMLFormElement) => {
    setContactBusy(true); setError("");
    try {
      const fd = new FormData(form);
      const payload = {
        workspace_id:scope.workspaceId,
        name:String(fd.get("name") || "").trim(),
        company:String(fd.get("company") || "").trim() || null,
        role:String(fd.get("role") || "").trim() || null,
        email:String(fd.get("email") || "").trim() || null,
        phone:String(fd.get("phone") || "").trim() || null,
        contact_type:String(fd.get("contact_type") || "other"),
        url:String(fd.get("url") || "").trim() || null,
        notes:String(fd.get("notes") || "").trim() || null,
        updated_at:new Date().toISOString(),
      };
      if (!payload.name) throw new Error("El nombre es obligatorio.");
      const query = contactEdit ? records.from("kw_internal_contacts").update(payload).eq("id", contactEdit.id).eq("workspace_id", scope.workspaceId) : records.from("kw_internal_contacts").insert(payload);
      const { error } = await query;
      if (error) throw error;
      setContactEdit(undefined); form.reset(); await loadContacts();
    } catch (e) { setError(message(e)); }
    finally { setContactBusy(false); }
  };

  const deleteContact = async (contact: Contact) => {
    setContactBusy(true); setError("");
    try {
      const { error } = await records.from("kw_internal_contacts").delete().eq("id", contact.id).eq("workspace_id", scope.workspaceId);
      if (error) throw error;
      if (contactEdit?.id === contact.id) setContactEdit(undefined);
      await loadContacts();
    } catch (e) { setError(message(e)); }
    finally { setContactBusy(false); }
  };

  if (!project) return <>{error ? <p className="error" role="alert">{error}</p> : <p role="status">Cargando Karma…</p>}</>;

  return <>
    <header className="page-heading karma-internal-heading"><div><span className="eyebrow">WORKSPACE / INTERNO</span><h1>Karma</h1></div></header>
    {error && <p className="error" role="alert">{error}</p>}

    <div className="karma-internal-layout">
      <div className="karma-internal-main">
        <div className="karma-shortcuts">
          <button className="card karma-shortcut" type="button" onClick={() => setModal("files")}><FileText size={20}/><span>Adjuntos</span><strong>{files.length}</strong></button>
          <button className="card karma-shortcut" type="button" onClick={() => setModal("credentials")}><KeyRound size={20}/><span>Credenciales</span><strong>{accessCount}</strong></button>
          <div className="karma-placeholder" aria-hidden="true" />
        </div>
        <EntityView kind="tasks" scope={scope} projectId={text(project.id)} compact />
      </div>
      <aside className="karma-internal-side">
        <div className="karma-placeholder karma-placeholder-side" aria-hidden="true" />
        <button className="card karma-shortcut karma-contact-shortcut" type="button" onClick={() => setModal("contacts")}><Users size={20}/><span>Contactos</span><strong>{contacts.length}</strong></button>
        <WorkJournal scope={scope} projectId={text(project.id)} />
      </aside>
    </div>

    {modal === "credentials" && <div className="care-project-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}><section className="care-project-modal care-project-resource-modal" role="dialog" aria-modal="true">
      <header className="care-project-modal-header"><div><span className="eyebrow">KARMA / CREDENCIALES</span><h2>Credenciales</h2></div><button className="care-project-modal-close" onClick={() => { setModal(null); void loadAccessCount(); }} aria-label="Cerrar"><X size={20}/></button></header>
      <EntityView kind="resources" scope={scope} projectId={text(project.id)} compact />
    </section></div>}

    {modal === "files" && <div className="care-project-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !preview && setModal(null)}><section className="care-project-modal care-project-resource-modal care-files-modal" role="dialog" aria-modal="true">
      <header className="care-project-modal-header care-files-header"><div><span className="eyebrow">KARMA / ADJUNTOS</span><h2>Adjuntos</h2></div><div className="care-files-header-actions"><input ref={fileInput} type="file" multiple hidden onChange={(e) => void uploadFiles(e.target.files)}/><button type="button" className="care-file-header-button" onClick={() => fileInput.current?.click()} disabled={fileBusy} aria-label="Adjuntar archivos"><Paperclip size={20}/></button><button type="button" className="care-project-modal-close" onClick={() => { setPreview(undefined); setModal(null); }} aria-label="Cerrar"><X size={20}/></button></div></header>
      {files.length ? <div className="care-file-wall">{files.map((file) => { const isImage=file.mime_type.startsWith("image/"); const signed=fileUrls[file.id]; return <article className="care-file-tile" key={file.id}><button type="button" className="care-file-thumb" onClick={() => void openFile(file)}>{isImage&&signed?<img src={signed} alt={file.original_filename}/>:<span className="care-file-fallback"><FileText size={28}/><small>{file.original_filename}</small></span>}</button><button type="button" className="care-file-delete" aria-label="Eliminar archivo" disabled={fileBusy} onClick={() => void deleteFile(file)}><Trash2 size={15}/></button></article>; })}</div>:<p className="muted care-files-empty">Todavía no hay archivos adjuntos.</p>}
      {preview && <div className="karma-file-preview" onMouseDown={(e) => e.target === e.currentTarget && setPreview(undefined)}><div className="karma-file-preview-card"><button type="button" className="care-project-modal-close" onClick={() => setPreview(undefined)} aria-label="Cerrar vista previa"><X size={20}/></button>{preview.file.mime_type.startsWith("image/")?<img src={preview.url} alt={preview.file.original_filename}/>:preview.file.mime_type === "application/pdf"?<iframe src={preview.url} title={preview.file.original_filename}/>:<div className="karma-file-generic"><FileText size={42}/><strong>{preview.file.original_filename}</strong><p className="muted">Vista previa no disponible para este formato.</p></div>}</div></div>}
    </section></div>}

    {modal === "contacts" && <div className="care-project-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}><section className="care-project-modal karma-contacts-modal" role="dialog" aria-modal="true">
      <header className="care-project-modal-header"><div><span className="eyebrow">KARMA / CONTACTOS</span><h2>Contactos</h2></div><button className="care-project-modal-close" onClick={() => { setModal(null); setContactEdit(undefined); }} aria-label="Cerrar"><X size={20}/></button></header>
      <div className="karma-contacts-grid">
        <form className="karma-contact-form" onSubmit={(e) => { e.preventDefault(); void saveContact(e.currentTarget); }} key={contactEdit?.id || "new"}>
          <h3>{contactEdit ? "Editar contacto" : "Nuevo contacto"}</h3>
          <input name="name" required placeholder="Nombre" defaultValue={contactEdit?.name || ""}/>
          <div className="karma-contact-form-row"><input name="company" placeholder="Empresa" defaultValue={contactEdit?.company || ""}/><input name="role" placeholder="Cargo / perfil" defaultValue={contactEdit?.role || ""}/></div>
          <div className="karma-contact-form-row"><input name="email" type="email" placeholder="Email" defaultValue={contactEdit?.email || ""}/><input name="phone" placeholder="Teléfono" defaultValue={contactEdit?.phone || ""}/></div>
          <select name="contact_type" defaultValue={contactEdit?.contact_type || "other"}><option value="offer">Oferta</option><option value="cv">CV</option><option value="collaborator">Colaborador</option><option value="supplier">Proveedor</option><option value="other">Otro</option></select>
          <input name="url" type="url" placeholder="Web / LinkedIn / Portfolio" defaultValue={contactEdit?.url || ""}/>
          <textarea name="notes" rows={4} placeholder="Notas" defaultValue={contactEdit?.notes || ""}/>
          <div className="karma-contact-actions"><button disabled={contactBusy}><Plus size={16}/>{contactBusy ? "Guardando…" : contactEdit ? "Guardar cambios" : "Añadir contacto"}</button>{contactEdit&&<button type="button" className="secondary" onClick={() => setContactEdit(undefined)}>Cancelar</button>}</div>
        </form>
        <div className="karma-contact-list">{contacts.length ? contacts.map((contact) => <article className="karma-contact-row" key={contact.id}><button type="button" className="karma-contact-main" onClick={() => setContactEdit(contact)}><strong>{contact.name}</strong><span>{[contact.company,contact.role].filter(Boolean).join(" · ") || contact.email || "Sin detalle"}</span><small>{contact.contact_type === "cv" ? "CV" : contact.contact_type === "offer" ? "Oferta" : contact.contact_type === "collaborator" ? "Colaborador" : contact.contact_type === "supplier" ? "Proveedor" : "Otro"}</small></button><button type="button" className="ghost danger" aria-label={`Eliminar ${contact.name}`} disabled={contactBusy} onClick={() => void deleteContact(contact)}><Trash2 size={16}/></button></article>) : <p className="muted">Todavía no hay contactos guardados.</p>}</div>
      </div>
    </section></div>}
  </>;
}
