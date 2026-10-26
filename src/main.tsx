import React, { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./work-v2.css";
import "./care-workspace.css";
import "./work-task-editor.css";
class ErrorBoundary extends Component<{ children: ReactNode },{ error: string }> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <div className="auth-page"><div className="card auth-card"><h1>No se pudo abrir Workspace</h1><p role="alert">{this.state.error}</p><button onClick={() => location.reload()}>Reintentar</button></div></div> : this.props.children; }
}
const root = createRoot(document.getElementById("root")!);
import("./App").then(({ default: App }) => root.render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>)).catch((error) => root.render(<div className="auth-page"><div className="card auth-card"><h1>Configura Karma Workspace</h1><p>{error.message}</p></div></div>));
