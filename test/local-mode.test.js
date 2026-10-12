import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

/*
 * Local test mode (`npm run dev:local`): the app runs on a snapshot of the live data
 * with no Supabase at all. The snapshot is a file (local-data/state.json, gitignored);
 * edits stay in this browser's localStorage, so nothing can reach the live row.
 */

const STATE = { stations: [{ id: "s1", name: "Megálló" }], vehicles: [], drivers: [], settings: { defaultBaseId: null } };

describe("parseSnapshot accepts what the Supabase dashboard hands out", () => {
  let parseSnapshot;
  beforeEach(async () => { ({ parseSnapshot } = await import("../src/localStorageShim.js")); });

  test("the bare state blob", () => {
    expect(parseSnapshot(JSON.stringify(STATE))).toEqual(STATE);
  });

  test("an app_state row, with data as an object or as a string", () => {
    expect(parseSnapshot(JSON.stringify({ id: "fuvarterv:v1", data: STATE }))).toEqual(STATE);
    expect(parseSnapshot(JSON.stringify({ data: JSON.stringify(STATE) }))).toEqual(STATE);
  });

  test("the SQL editor's 'copy as JSON': an array of rows", () => {
    expect(parseSnapshot(JSON.stringify([{ data: STATE }]))).toEqual(STATE);
  });

  test("anything else is an error that says what was expected", () => {
    expect(() => parseSnapshot("[]")).toThrow(/app_state/);
    expect(() => parseSnapshot("{\"foo\":1}")).toThrow(/app_state/);
    expect(() => parseSnapshot("nem json")).toThrow();
  });
});

describe("the local window.storage", () => {
  let shim;
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    shim = await import("../src/localStorageShim.js");
  });
  afterEach(() => vi.unstubAllGlobals());

  test("first read comes from the snapshot file", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify([{ data: STATE }]) })));
    const r = await shim.localStorageShim.get("fuvarterv:v1");
    expect(JSON.parse(r.value)).toEqual(STATE);
    expect(shim.localStatus().source).toBe("file");
  });

  test("saves stay in the browser and win over the file afterwards", async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(STATE) }));
    vi.stubGlobal("fetch", fetch);
    const edited = { ...STATE, vehicles: [{ id: "b1" }] };
    await shim.localStorageShim.set("fuvarterv:v1", JSON.stringify(edited));
    const r = await shim.localStorageShim.get("fuvarterv:v1");
    expect(JSON.parse(r.value)).toEqual(edited);
    expect(fetch).not.toHaveBeenCalled();
    expect(shim.localStatus().source).toBe("browser");
  });

  test("resetting drops the browser copy, so the file is read again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(STATE) })));
    await shim.localStorageShim.set("fuvarterv:v1", JSON.stringify({ ...STATE, drivers: [{ id: "x" }] }));
    shim.resetLocalCopy();
    const r = await shim.localStorageShim.get("fuvarterv:v1");
    expect(JSON.parse(r.value)).toEqual(STATE);
  });

  test("no snapshot file means an empty workspace, and the status says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, text: async () => "" })));
    expect(await shim.localStorageShim.get("fuvarterv:v1")).toBe(null);
    expect(shim.localStatus().source).toBe("none");
  });

  test("a broken snapshot file is an error, not an empty workspace", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => "{\"foo\":1}" })));
    await expect(shim.localStorageShim.get("fuvarterv:v1")).rejects.toThrow(/app_state/);
  });
});

describe("local mode never talks to Supabase", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  test("even with live credentials in .env, the client is off", async () => {
    vi.stubEnv("MODE", "offline");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    vi.resetModules();
    const c = await import("../src/supabaseClient.js");
    expect(c.isConfigured).toBe(false);
    expect(c.supabase).toBe(null);
  });

  test("outside local mode the same credentials configure it", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    vi.resetModules();
    const c = await import("../src/supabaseClient.js");
    expect(c.isConfigured).toBe(true);
  });
});
