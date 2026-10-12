import { useEffect, useState } from "react";
import { RoleContext } from "./roleContext.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { localStatus, resetLocalCopy, localStorageShim } from "./localStorageShim.js";
import { STORAGE_KEY } from "./data/storage.js";
import "./ui/styles.css";

/*
 * The shell for local test mode, in place of AuthGate: no sign-in, admin role, and a
 * bar that keeps saying this is not the live data. Its two buttons start over from the
 * snapshot file and download the working copy (to look at what a change did to it).
 */

const SOURCE_TEXT = {
  file: "a fájlból betöltve, még nincs módosítás",
  browser: "módosítva, a változások csak ebben a böngészőben vannak",
  none: "nincs local-data/state.json, üres munkaterület",
};

export default function LocalShell({ children }) {
  const [status, setStatus] = useState(localStatus());
  /* The source changes on the first read and on the first save, both inside App;
     a slow poll is the simplest way to follow it without wiring App to the shell. */
  useEffect(() => {
    const t = setInterval(() => setStatus(localStatus()), 1000);
    return () => clearInterval(t);
  }, []);

  const reset = () => {
    if (!window.confirm("Eldobod az itteni módosításokat, és újratöltöd az adatot a fájlból?")) return;
    resetLocalCopy();
    window.location.reload();
  };
  const download = async () => {
    const r = await localStorageShim.get(STORAGE_KEY);
    if (!r) return;
    const blob = new Blob([JSON.stringify(JSON.parse(r.value), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fuvarterv-local-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <RoleContext.Provider value={{ role: "admin", email: null }}>
      <div role="status" style={{
        position: "sticky", top: 0, zIndex: 1000, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
        padding: "6px 12px", background: "#b45309", color: "#fff", fontSize: 14,
      }}>
        <b>HELYI TESZT</b>
        <span style={{ flex: "1 1 200px" }}>Nem a valós adat · {SOURCE_TEXT[status.source] || "betöltés…"}</span>
        <button onClick={download} style={barBtn}>Munkapéldány letöltése</button>
        <button onClick={reset} style={barBtn}>Újratöltés a fájlból</button>
      </div>
      <ErrorBoundary>{children}</ErrorBoundary>
    </RoleContext.Provider>
  );
}

const barBtn = { background: "rgba(255,255,255,.15)", color: "#fff", border: "1px solid rgba(255,255,255,.5)", borderRadius: 6, padding: "2px 10px", cursor: "pointer" };
