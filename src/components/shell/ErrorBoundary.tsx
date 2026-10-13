import { Component, type ReactNode } from "react";

/**
 * Last-resort crash guard around the authenticated shell.
 * Only renders if React throws — normal operation is untouched.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; detail: string }> {
  state = { failed: false, detail: "" };

  static getDerivedStateFromError(e: unknown) {
    return { failed: true, detail: e instanceof Error ? e.message : "Unknown render error" };
  }

  componentDidCatch() {
    try { console.error("[servicegrid] shell error boundary tripped"); } catch { /* noop */ }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", background: "#090c11", color: "#dbe4f3", display: "grid", placeItems: "center", padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ maxWidth: 520, background: "#10161f", border: "1px solid #1d2940", borderRadius: 10, padding: 24 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 8 }}>ServiceGrid hit a render problem</div>
          <div style={{ fontSize: 13, color: "#8b99b0", marginBottom: 6 }}>Your workspace data is intact in local storage. Reload to retry.</div>
          <div className="so-mono" style={{ fontSize: 11, color: "#5d6b84", marginBottom: 14 }}>{this.state.detail}</div>
          <button className="so-ghost-btn solid" onClick={() => window.location.reload()}>Reload workspace</button>
        </div>
      </div>
    );
  }
}
