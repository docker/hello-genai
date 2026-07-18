import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { TooltipProvider } from "./components/ui/tooltip";
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/manrope";
import "@fontsource-variable/outfit";
import "@fontsource-variable/figtree";
import "@fontsource-variable/lora";
import "katex/dist/katex.min.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={200} skipDelayDuration={300}>
      <App />
    </TooltipProvider>
  </React.StrictMode>
);

// B8 — register the offline shell service worker (production builds only, and
// only where the API is same-origin; a SW needs a secure context, which
// localhost satisfies and HTTPS will satisfy everywhere else).
if ("serviceWorker" in navigator && (import.meta as any).env?.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* offline support is optional */ });
  });
}
