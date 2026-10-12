import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { seedState } from "../src/data/seed.js";

/*
 * Local test mode end to end: the local shell and the real App on the local storage,
 * fed a snapshot in the SQL editor's array-of-rows shape. The app must come up on the
 * snapshot's data as an admin, and the bar must say where the data came from.
 */

let container, root;
beforeEach(() => { localStorage.clear(); container = document.createElement("div"); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); container.remove(); vi.unstubAllGlobals(); vi.resetModules(); });

const settle = async () => { for (let i = 0; i < 20; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); };

describe("the app on a local snapshot", () => {
  test("loads the snapshot, as an admin, with the bar saying so", async () => {
    const snap = seedState();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify([{ data: snap }]) })));
    vi.stubGlobal("matchMedia", (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    const { localStorageShim } = await import("../src/localStorageShim.js");
    window.storage = localStorageShim;
    const LocalShell = (await import("../src/LocalShell.jsx")).default;
    const App = (await import("../src/App.jsx")).default;
    act(() => { root = createRoot(container); root.render(<LocalShell><App /></LocalShell>); });
    await settle();
    expect(container.textContent).toContain("HELYI TESZT");
    /* An admin sees the Beosztás optimiser and the migration offer for the bus that
       still has a depot of its own. */
    /* An admin lands on the week, which shows the snapshot's trainings. */
    expect(container.textContent).not.toContain("Fuvarterv betöltése");
    expect(container.textContent).toContain("FU12");
    await act(async () => { await new Promise((r) => setTimeout(r, 1100)); });
    expect(container.textContent).toContain("a fájlból betöltve");
  });
});
