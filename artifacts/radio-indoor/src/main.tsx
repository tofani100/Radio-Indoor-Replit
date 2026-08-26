import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

window.addEventListener("error", (e) => {
  console.error("Global Error Caught:", e);
});

const rootElement = document.getElementById("root");
if (rootElement) {
  try {
    createRoot(rootElement).render(<App />);
  } catch (err) {
    rootElement.innerHTML = `<div style="padding: 20px; color: red;">Error rendering app: ${err}</div>`;
  }
}
