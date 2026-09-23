/* The invite client: what it sends, and how it classifies what comes back.

   The interesting cases are the failures. A misordered redirect in netlify.toml hands
   back the index.html shell with status 200, and a local `npm run dev` has no
   function at all — both have to arrive as a code the screen can explain, not as a
   JSON parse crash. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getSession = vi.fn();

vi.mock("../src/supabaseClient.js", () => ({
  isConfigured: true,
  supabase: { auth: { getSession: () => getSession() } },
}));

const { createInvite, isAlreadyRegistered, INVITE_ENDPOINT } = await import("../src/data/invites.js");

const reply = (status, body, { json = true } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (!json) throw new SyntaxError("Unexpected token <");
    return body;
  },
});

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: "tok-123" } } });
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createInvite", () => {
  it("posts the address and role with the caller's bearer token", async () => {
    globalThis.fetch.mockResolvedValue(reply(200, { link: "https://x/y", email: "a@b.hu", role: "sofor" }));

    const out = await createInvite("  A@B.hu ", "sofor");

    expect(out).toEqual({ link: "https://x/y", email: "a@b.hu", role: "sofor" });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(INVITE_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer tok-123");
    // Lower-cased and trimmed before it leaves the browser, so the address the
    // server writes into user_roles matches the one fetchRole looks up.
    expect(JSON.parse(init.body)).toEqual({ email: "a@b.hu", role: "sofor" });
  });

  it("refuses to call the server without a session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(createInvite("a@b.hu", "sofor")).rejects.toMatchObject({ code: "NO_SESSION" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reports a refusal by its server code", async () => {
    globalThis.fetch.mockResolvedValue(reply(403, { error: "not_admin" }));
    await expect(createInvite("a@b.hu", "sofor")).rejects.toMatchObject({ code: "not_admin" });
  });

  it("turns an HTML reply into a code instead of a parse crash", async () => {
    // What the SPA catch-all returns if /api/* is matched after it.
    globalThis.fetch.mockResolvedValue(reply(200, null, { json: false }));
    await expect(createInvite("a@b.hu", "sofor")).rejects.toMatchObject({ code: "BAD_REPLY" });
  });

  it("reports a missing endpoint (local dev) as an HTTP code", async () => {
    globalThis.fetch.mockResolvedValue(reply(404, null, { json: false }));
    await expect(createInvite("a@b.hu", "sofor")).rejects.toMatchObject({ code: "HTTP_404" });
  });

  it("reports an unreachable server rather than throwing the fetch error", async () => {
    globalThis.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(createInvite("a@b.hu", "sofor")).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("treats a 200 with no link as a bad reply", async () => {
    globalThis.fetch.mockResolvedValue(reply(200, { email: "a@b.hu" }));
    await expect(createInvite("a@b.hu", "sofor")).rejects.toMatchObject({ code: "BAD_REPLY" });
  });
});

describe("isAlreadyRegistered", () => {
  it("recognises the one failure that means 'use the other mode'", () => {
    expect(isAlreadyRegistered({ code: "invite_failed", detail: "A user with this email address has already been registered" })).toBe(true);
  });

  it("does not claim it for other invite failures", () => {
    expect(isAlreadyRegistered({ code: "invite_failed", detail: "rate limit exceeded" })).toBe(false);
    expect(isAlreadyRegistered({ code: "not_admin", detail: "" })).toBe(false);
  });
});
