/* Fuvarterv — asking the server for a single-use registration link.

   The counterpart of netlify/functions/invite.mjs. Everything privileged happens
   there; this only forwards the caller's access token and turns the reply into
   either a link or a coded error. It sits beside roles.js because both talk to the
   server about people rather than about the workspace blob, so neither goes through
   the window.storage seam.

   Errors carry a `code` and no prose: the screen owns the Hungarian wording, exactly
   as it does for the RLS rejection in roles.js. */

import { supabase, isConfigured } from "../supabaseClient.js";

const coded = (code, message, detail) =>
  Object.assign(new Error(message || code), { code, detail: detail || "" });

/* Kept relative on purpose. netlify.toml rewrites /api/* onto the function, so the
   call is same-origin and the CSP's `connect-src 'self'` already covers it — an
   absolute function URL would need a new directive and would break on preview
   deploys, which each have their own hostname. */
export const INVITE_ENDPOINT = "/api/invite";

export async function createInvite(email, role) {
  if (!isConfigured || !supabase) throw coded("NOT_CONFIGURED", "Supabase is not configured");

  /* The server decides who may invite, but it needs to know who is asking. Reading
     the session here rather than passing an e-mail down means the identity is the
     verified token, not something a screen could get wrong. */
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw coded("NO_SESSION", "No active session");

  let res;
  try {
    res = await fetch(INVITE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: (email || "").trim().toLowerCase(), role }),
    });
  } catch {
    // The request never left, or never arrived: offline, or the function is not
    // deployed on this host at all.
    throw coded("NETWORK", "The invite endpoint could not be reached");
  }

  /* A non-JSON body is its own diagnosis rather than a parse crash: it is what a
     misordered redirect looks like, where /api/invite falls through to the SPA
     catch-all and the "reply" is the index.html shell. */
  let body = null;
  try {
    body = await res.json();
  } catch {
    throw coded(res.ok ? "BAD_REPLY" : `HTTP_${res.status}`, "The reply was not JSON");
  }

  if (!res.ok) throw coded(body?.error || `HTTP_${res.status}`, body?.error, body?.detail);
  if (!body?.link) throw coded("BAD_REPLY", "The reply contained no link");

  return { link: body.link, email: body.email, role: body.role };
}

/* True when the address already has an account. The server sends the Supabase
   message along for this one case because the remedy is different from every other
   failure: grant the role from the list instead of inviting. */
export const isAlreadyRegistered = (error) =>
  error?.code === "invite_failed" && /already|registered|exists/i.test(error?.detail || "");
