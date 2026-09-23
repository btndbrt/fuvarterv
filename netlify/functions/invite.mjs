/* Fuvarterv — the ONE piece of privileged server code (ADR-30).

   It exists because generating a registration link is an `auth.admin` call, and the
   whole admin namespace needs the service_role key. That key bypasses row level
   security completely — it is the opposite of the anon key, which is public by
   design — so it can never reach the browser bundle. Everything else in this app
   runs client-side against RLS; this file is the exception, kept as small as it can
   be for exactly that reason.

   WHAT IT DOES NOT DO. It does not send e-mail. Supabase's built-in mailer is rate
   limited to a handful of messages an hour and is not meant for production, so
   instead of a delivery path nobody controls, this returns a single-use link and the
   admin passes it on however they already talk to people.

   THE THREAT MODEL. The caller's JWT is checked against Supabase (not merely
   decoded), the caller's own e-mail comes out of that verified token rather than
   from the request body, and admin rights are read from user_roles server-side. A
   driver who crafts a POST by hand gets a 403; a forged or expired token gets a 401.
   Nothing in the request body is trusted except the address to invite and the role,
   both validated below. */

import { createClient } from "@supabase/supabase-js";

/* The roles the schema knows. An allowlist rather than a format check, because this
   value is written straight into user_roles and "admin " or "Admin" would silently
   create a row that is_admin() never matches — an account that looks granted in the
   list and is a driver in reality. */
const ROLES = new Set(["admin", "sofor"]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Errors are returned as short codes, never as the underlying message. The client
   maps them to Hungarian sentences; leaking the raw error would describe the
   database to anyone who can reach the endpoint. `detail` carries a Supabase
   message only where it is safe and useful (an address that is already registered),
   because without it the admin cannot tell that case from a real failure. */
const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  /* VITE_SUPABASE_URL is accepted as a fallback deliberately: Netlify hands every
     site variable to functions as well, and the project URL is public either way, so
     reusing the one already configured for the build means the ONLY new setting this
     feature needs is the service_role key. One variable is one chance to get it
     wrong, not three. */
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json(500, { error: "not_configured" });

  const header = req.headers.get("authorization") || "";
  const token = /^bearer /i.test(header) ? header.slice(7).trim() : "";
  if (!token) return json(401, { error: "no_token" });

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "bad_body" });
  }

  const email = String(payload?.email ?? "").trim().toLowerCase();
  const role = String(payload?.role ?? "");
  if (!EMAIL.test(email)) return json(400, { error: "bad_email" });
  if (!ROLES.has(role)) return json(400, { error: "bad_role" });

  /* persistSession/autoRefreshToken off: a server function handles one request and
     exits, and a client that tries to persist a session reaches for storage that is
     not there. */
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* WHO IS CALLING. getUser(token) asks Supabase to validate the signature and
     expiry; decoding the JWT here would accept anything a caller chose to write in
     it. The e-mail is then taken from the verified user, never from the body. */
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  const callerEmail = caller?.user?.email?.trim().toLowerCase();
  if (callerErr || !callerEmail) return json(401, { error: "bad_token" });

  /* IS THE CALLER AN ADMIN. An explicit row is required: ADR-10 makes "no row" mean
     driver, so treating a missing row as permitted would hand invites to everyone
     who can log in. */
  const { data: callerRow, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("email", callerEmail)
    .maybeSingle();
  if (roleErr) return json(500, { error: "role_lookup_failed" });
  if (callerRow?.role !== "admin") return json(403, { error: "not_admin" });

  /* The ?invite=1 query parameter is what tells the app to ask for a password. It
     has to be a QUERY parameter, not part of the hash: supabase-js consumes and
     clears the hash as soon as it has the tokens out of it, so a marker left there
     would be gone before any component could read it.
     process.env.URL is Netlify's own canonical site URL; SITE_URL overrides it for
     a custom domain. */
  const site = (process.env.SITE_URL || process.env.URL || "").replace(/\/+$/, "");
  if (!site) return json(500, { error: "no_site_url" });

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${site}/?invite=1` },
  });
  if (linkErr) {
    /* The common case by far is an address that already has an account, which is
       not a fault but a different job — granting a role to somebody who can already
       log in, which the Users panel does without coming here at all. */
    return json(400, { error: "invite_failed", detail: linkErr.message || "" });
  }

  const action = link?.properties?.action_link || null;
  if (!action) return json(500, { error: "no_link" });

  /* The role row goes in AFTER the account exists, so a failure here cannot leave a
     role granted to an address that was never invited. The reverse order is the
     dangerous one. If this write fails the admin is told precisely that, because the
     account now exists and re-inviting would fail as "already registered" — the
     recovery is to set the role from the list, not to invite again. */
  const { error: upErr } = await admin
    .from("user_roles")
    .upsert({ email, role }, { onConflict: "email" });
  if (upErr) return json(500, { error: "role_write_failed" });

  return json(200, { link: action, email, role });
};
