import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker (PWA: offline shell + push). Tidak dipakai di build Capacitor.
if ("serviceWorker" in navigator && import.meta.env.PROD && import.meta.env.MODE !== "capacitor") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
  });
}
