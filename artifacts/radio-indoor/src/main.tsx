import { createRoot } from "react-dom/client";
import { Component, type ReactNode, type ErrorInfo } from "react";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Configure API base URL if provided via VITE_API_URL or stored in localStorage
const storedApiUrl = typeof window !== "undefined" ? localStorage.getItem("radio_indoor_api_url") : null;
const envApiUrl = import.meta.env.VITE_API_URL;
if (storedApiUrl) {
  setBaseUrl(storedApiUrl);
} else if (envApiUrl) {
  setBaseUrl(envApiUrl);
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("React ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: "Inter, sans-serif", textAlign: "center", maxWidth: 800, margin: "0 auto" }}>
          <h2 style={{ color: "#e11d48", fontSize: 22, marginBottom: 8 }}>Erro ao carregar a aplicação</h2>
          <p style={{ color: "#333", fontWeight: "bold", fontSize: 16, marginBottom: 16 }}>{this.state.error?.message}</p>
          <pre style={{ textAlign: "left", background: "#f1f5f9", padding: 16, borderRadius: 8, fontSize: 12, overflowX: "auto", color: "#64748b" }}>
            {this.state.error?.stack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 24, padding: "10px 24px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}>
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Clear obsolete service workers and caches on load to avoid running outdated bundles
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => caches.delete(k));
    });
  }
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
