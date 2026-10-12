import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

/* Local test mode (`npm run dev:local`) runs on a snapshot file with no Supabase.
   Either shell is imported dynamically, because AuthGate installs the Supabase-backed
   window.storage at import time and the local one must not have that happen. In a
   production build MODE is "production", so the local branch is dead code. */
const LOCAL = import.meta.env.MODE === "offline";

async function boot() {
  let Shell;
  if (LOCAL) {
    const { localStorageShim } = await import("./localStorageShim.js");
    window.storage = localStorageShim;
    Shell = (await import("./LocalShell.jsx")).default;
  } else {
    Shell = (await import("./AuthGate.jsx")).default;
  }
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <Shell>
        <App />
      </Shell>
    </React.StrictMode>,
  );
}

boot();
