import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { language } from "./lib/i18n";
import "./styles/app.css";

document.documentElement.dataset.platform = navigator.platform.includes("Mac")
  ? "mac"
  : "other";
if ("__TAURI_INTERNALS__" in window) {
  document.documentElement.dataset.shell = "tauri";
  void import("@tauri-apps/api/core").then(({ invoke }) =>
    invoke("set_menu_language", { language }),
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
