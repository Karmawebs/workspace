import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  Folder,
  CheckSquare,
  CalendarDays,
  BookOpen,
  Users,
  Bell,
  Flag,
  Layers,
  Server,
  Link,
  LogOut,
  Plus,
  X,
  Settings,
  Circle,
  type LucideIcon,
} from "lucide-react";
import { apps, navigation } from "../modules/config";
import type { AppKey } from "../core/model";
import "./Sidebar.css";

const icons: Record<string, LucideIcon> = {
  dashboard: LayoutGrid,
  projects: Folder,
  tasks: CheckSquare,
  events: CalendarDays,
  journal: BookOpen,
  calendar: CalendarDays,
  content: Layers,
  milestones: Flag,
  sites: Server,
  connections: Link,
  clients: Users,
  alerts: Bell,
  settings: Settings,
  users: Users,
};

type Props = {
  app: AppKey;
  enabledApps: AppKey[];
  items: typeof navigation;
  email?: string;
  role: string;
  open: boolean;
  canCreate: boolean;
  onClose: () => void;
  onCreate: () => void;
  onSignOut: () => void;
};

export function Sidebar({
  app,
  enabledApps,
  items,
  email,
  role,
  open,
  canCreate,
  onClose,
  onCreate,
  onSignOut,
}: Props) {
  return (
    <>
      <aside
        id="workspace-navigation"
        className={`workspace-sidebar${open ? " is-open" : ""}`}
        aria-label="Navegación de Workspace"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <NavLink
          className="rail-brand"
          to={`/${app}/${app === "work" ? "dashboard" : "projects"}`}
          aria-label="Karma · Inicio"
        >
          <span className="rail-icon">
            <img
              src="/assets/karma-compact.png"
              alt="Karma"
              width="40"
              height="32"
            />
          </span>
          <span className="rail-label rail-wordmark">WORKSPACE</span>
        </NavLink>
        <button
          className="rail-close"
          onClick={onClose}
          aria-label="Cerrar navegación"
        >
          <X size={20} />
        </button>
        <div className="rail-scroll">
          <nav className="rail-apps" aria-label="Aplicaciones">
            {enabledApps.map((key) => (
              <NavLink
                key={key}
                to={`/${key}/${key === "work" ? "dashboard" : "projects"}`}
                className={`rail-row${key === app ? " selected" : ""}`}
                aria-label={apps[key].name}
                aria-current={key === app ? "true" : undefined}
              >
                <span className="rail-icon rail-initial" aria-hidden="true">
                  {apps[key].name[0]}
                </span>
                <span className="rail-label">{apps[key].name}</span>
              </NavLink>
            ))}
          </nav>
          <nav className="rail-nav" aria-label="Navegación principal">
            {items.map((item) => {
              const Icon = icons[item.path] ?? Circle;
              return (
                <NavLink
                  key={item.path}
                  to={`/${app}/${item.path}`}
                  className="rail-row"
                  aria-label={item.name}
                >
                  <span className="rail-icon">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="rail-label">{item.name}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
        {canCreate && (
          <button
            className="rail-row rail-add"
            aria-label={app === "care" ? "Nuevo proyecto Care" : "Nuevo proyecto"}
            onClick={onCreate}
          >
            <span className="rail-icon">
              <Plus size={20} aria-hidden="true" />
            </span>
            <span className="rail-label">Nuevo proyecto</span>
          </button>
        )}
        <footer className="rail-account">
          <span className="rail-icon">
            <span
              className="rail-avatar"
              aria-label={`Usuario ${email || "Workspace"}`}
            >
              {email?.[0]?.toUpperCase() || "K"}
            </span>
          </span>
          <div className="rail-label rail-user">
            <strong title={email}>{email?.split("@")[0]}</strong>
            <small>{role}</small>
          </div>
          <button
            className="rail-label rail-signout"
            aria-label="Cerrar sesión"
            onClick={onSignOut}
          >
            <LogOut size={18} />
          </button>
        </footer>
      </aside>
      {open && (
        <button
          className="rail-scrim"
          aria-label="Cerrar menú"
          onClick={onClose}
        />
      )}
    </>
  );
}
