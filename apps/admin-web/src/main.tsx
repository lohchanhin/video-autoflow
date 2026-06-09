import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { hydrateLocalStateFromServer } from "./lib/app-state-sync.js";
import "./styles.css";

void hydrateLocalStateFromServer().finally(() => {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
