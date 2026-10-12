/*
 * Local test mode (`npm run dev:local`): the `window.storage` contract backed by a
 * snapshot file and this browser's localStorage, with no Supabase at all.
 *
 * The first read comes from local-data/state.json (gitignored: it holds the club's
 * real names and phone numbers). Every save goes to localStorage only, and from then
 * on the browser copy wins over the file. resetLocalCopy() drops it, so the next read
 * starts from the file again. Nothing here can reach the live row: supabaseClient.js
 * switches the client off in this mode.
 */

export const SNAPSHOT_URL = "/local-data/state.json";
const PREFIX = "fuvarterv-local:";

/* Where the current state came from: "file", "browser" (edited here), "none" (no
   snapshot file, so an empty workspace), or null before the first read. */
let source = null;
export const localStatus = () => ({ source, url: SNAPSHOT_URL });

/* The snapshot as the Supabase dashboard hands it out: the bare blob, an app_state
   row ({ id, data, updated_at }, data possibly a string), or the SQL editor's "copy
   as JSON", an array of such rows. */
export function parseSnapshot(text) {
  let v = JSON.parse(text);
  if (Array.isArray(v)) v = v[0];
  if (v && typeof v === "object" && "data" in v) v = typeof v.data === "string" ? JSON.parse(v.data) : v.data;
  const looksLikeState = v && typeof v === "object" && !Array.isArray(v)
    && ["stations", "venues", "vehicles", "drivers", "teams", "trainings", "settings"].some((k) => k in v);
  if (!looksLikeState) {
    throw new Error("local-data/state.json: expected the app state, an app_state row, or an array of app_state rows.");
  }
  return v;
}

export function resetLocalCopy() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
  }
  source = null;
}

export const localStorageShim = {
  async get(key) {
    const saved = localStorage.getItem(PREFIX + key);
    if (saved != null) { source = "browser"; return { key, value: saved }; }
    const res = await fetch(SNAPSHOT_URL, { cache: "no-store" });
    if (!res.ok) { source = "none"; return null; }
    const state = parseSnapshot(await res.text());
    source = "file";
    return { key, value: JSON.stringify(state) };
  },
  async set(key, value) {
    localStorage.setItem(PREFIX + key, value);
    source = "browser";
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: true };
  },
  async list(prefix = "") {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
    }
    return { keys };
  },
};
