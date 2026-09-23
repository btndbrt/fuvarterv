/* Fuvarterv — Users: granting the admin and driver roles by e-mail address.
   A lista a Supabase user_roles tábláját mutatja (nem az app-állapot része,
   ezért nem a window.storage-on át jön). Csak admin éri el: sofőr az Adatok
   fülre el sem jut, és a tábla írását a szerver (RLS) is csak adminnak engedi. */

import { useEffect, useState } from "react";
import { Plus, AlertTriangle, RefreshCw, Mail, Copy } from "lucide-react";
import { listRoles, upsertRole, removeRole, isMissingRolesTable } from "../data/roles.js";
import { createInvite, isAlreadyRegistered } from "../data/invites.js";
import { isConfigured } from "../supabaseClient.js";
import { Field, DangerBtn, EmptyState } from "../ui/base.jsx";

const ROLE_LABELS = { admin: "Admin", sofor: "Sofőr" };

export function UsersPanel({ myEmail }) {
  const me = (myEmail || "").trim().toLowerCase();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error | migrate
  const [errMsg, setErrMsg] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("sofor");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState("invite"); // invite | role
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isConfigured) {
      setStatus("error");
      setErrMsg("Nincs szerver-kapcsolat beállítva (helyi futtatás?) — a szerepkörök itt nem kezelhetők.");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    listRoles()
      .then((r) => { if (!cancelled) { setRows(r); setStatus("ready"); } })
      .catch((e) => {
        if (cancelled) return;
        if (isMissingRolesTable(e)) setStatus("migrate");
        else { setStatus("error"); setErrMsg("Nem sikerült betölteni a felhasználókat. Ellenőrizd a kapcsolatot, és próbáld újra."); }
      });
    return () => { cancelled = true; };
  }, [tick]);

  const fail = (e) => {
    setErrMsg(
      e?.code === "42501" || /row-level security/i.test(e?.message || "")
        ? "A szerver elutasította a módosítást — ehhez admin szerepkör kell."
        : "A módosítás nem sikerült. Ellenőrizd a kapcsolatot, és próbáld újra.",
    );
  };

  const add = async () => {
    setBusy(true);
    setErrMsg("");
    try {
      const saved = await upsertRole(newEmail, newRole);
      setRows((r) => [...r.filter((x) => x.email !== saved.email), saved].sort((a, b) => a.email.localeCompare(b.email)));
      setNewEmail("");
      setNewRole("sofor");
    } catch (e) { fail(e); }
    setBusy(false);
  };

  /* A meghívás hibái másfélék, mint a tábla-írásé: itt nem az RLS utasít vissza,
     hanem a szerverfüggvény — és a leggyakoribb eset (a cím már regisztrált) nem is
     hiba, hanem a másik mód. Ezért kap saját szöveget, a `fail` helyett. */
  const failInvite = (e) => {
    if (isAlreadyRegistered(e))
      return setErrMsg("Ehhez a címhez már tartozik fiók, ezért nem kell meghívni. Válts a „Csak szerepkör” módra, és állítsd be a szerepkörét.");
    const byCode = {
      not_admin: "A szerver elutasította: meghívót csak admin készíthet.",
      bad_email: "Ez nem érvényes e-mail-cím.",
      bad_role: "Ismeretlen szerepkör.",
      not_configured: "A szerveren hiányzik a meghívó funkció beállítása (SUPABASE_SERVICE_ROLE_KEY).",
      no_site_url: "A szerveren nincs beállítva az oldal címe, így a meghívó link nem készíthető el.",
      role_write_failed: "A fiók elkészült, de a szerepkört nem sikerült beállítani. Állítsd be a listában.",
      NO_SESSION: "Lejárt a munkameneted. Lépj be újra.",
      NETWORK: "A szerver nem érhető el. Ellenőrizd a kapcsolatot.",
    };
    if (byCode[e?.code]) return setErrMsg(byCode[e.code]);
    // 404 és a nem-JSON válasz ugyanazt jelenti: nincs ott a funkció. Helyi `npm run
    // dev` alatt ez a normális, mert a Netlify-funkciók csak a kitelepített appban futnak.
    if (e?.code === "BAD_REPLY" || /^HTTP_/.test(e?.code || ""))
      return setErrMsg("A meghívó funkció nem érhető el ezen a címen. Helyi futtatásnál ez normális — a kitelepített appban működik.");
    setErrMsg("A meghívó készítése nem sikerült. Próbáld újra.");
  };

  const invite = async () => {
    setBusy(true);
    setErrMsg("");
    setInviteLink("");
    setCopied(false);
    try {
      const made = await createInvite(newEmail, newRole);
      setInviteLink(made.link);
      // A szerepkör sort a szerver írta meg, de a lista itt még a régit mutatja.
      setRows((r) => [...r.filter((x) => x.email !== made.email), { email: made.email, role: made.role }]
        .sort((a, b) => a.email.localeCompare(b.email)));
      setNewEmail("");
      setNewRole("sofor");
    } catch (e) { failInvite(e); }
    setBusy(false);
  };

  /* A vágólap API https nélkül és régebbi böngészőkben nincs meg, a link viszont
     ilyenkor is ki van írva és kijelölhető — ezért a másolás elmaradása nem hiba,
     csak nem vált át a felirat. */
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch { /* marad a kijelölhető mező */ }
  };

  const changeRole = async (email, role) => {
    setErrMsg("");
    const prevRows = rows;
    setRows((r) => r.map((x) => (x.email === email ? { ...x, role } : x)));
    try { await upsertRole(email, role); } catch (e) { setRows(prevRows); fail(e); }
  };

  const remove = async (email) => {
    setErrMsg("");
    const prevRows = rows;
    setRows((r) => r.filter((x) => x.email !== email));
    try { await removeRole(email); } catch (e) { setRows(prevRows); fail(e); }
  };

  if (status === "migrate") {
    return (
      <div className="px-4 pb-4">
        <div className="banner banner-warn mt-3"><AlertTriangle size={18} />
          A szerepkör-tábla még nincs létrehozva a szerveren. Futtasd le a{" "}
          <code>supabase/migrations/0001_initial_schema.sql</code> fájlt a Supabase SQL editorban
          (a pontos lépések a <code>supabase/migrations/README.md</code>-ben), aztán térj vissza ide.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4">
      <p className="text-sm py-3" style={{ color: "var(--ink2)", lineHeight: 1.5 }}>
        Itt döntöd el, ki mit érhet el. Az <b>admin</b> mindent láthat és szerkeszthet, a{" "}
        <b>sofőr</b> csak a Sofőr fület látja, és semmin nem tud változtatni. Akit nem veszel
        fel ide, az belépve sofőrnek számít. A változás a felhasználó következő belépésekor
        vagy újratöltésekor él.
      </p>

      {errMsg && <div className="banner banner-danger mb-3"><AlertTriangle size={18} />{errMsg}</div>}

      {status === "loading" && <div className="py-4" style={{ color: "var(--ink2)" }}>Betöltés…</div>}
      {status === "error" && !errMsg && (
        <div className="banner banner-danger mb-3"><AlertTriangle size={18} />Nem sikerült betölteni a felhasználókat.</div>
      )}
      {status === "error" && (
        <button className="btn btn-ghost mb-3" onClick={() => { setErrMsg(""); setTick((t) => t + 1); }}>
          <RefreshCw size={15} /> Újrapróbálkozás
        </button>
      )}

      {status === "ready" && (
        <>
          <div className="flex flex-col gap-2 mb-4">
            {rows.map((r) => {
              const own = r.email === me;
              return (
                <div key={r.email} className="card p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold" style={{ overflowWrap: "anywhere" }}>{r.email}</div>
                    {own && <div className="text-sm" style={{ color: "var(--ink2)" }}>ez vagy te — magadat nem tudod kizárni innen</div>}
                  </div>
                  {/* A saját sor nem fokozható le és nem törölhető: különben egy
                      kattintással kizárhatnád magad, és csak a Supabase SQL
                      editorból tudnál visszajutni. Más admin persze lefokozhat. */}
                  {own
                    ? <span className="pill pill-miss disp">{ROLE_LABELS[r.role] || r.role}</span>
                    : (
                      <>
                        <select className="inp" style={{ width: "auto" }} value={r.role} aria-label={`${r.email} szerepköre`}
                          onChange={(e) => changeRole(r.email, e.target.value)}>
                          <option value="admin">Admin</option>
                          <option value="sofor">Sofőr</option>
                        </select>
                        <DangerBtn small onConfirm={() => remove(r.email)} />
                      </>
                    )}
                </div>
              );
            })}
            {rows.length === 0 && (
              <EmptyState>
                Még senkinek nincs szerepköre. Vedd fel magad adminként a{" "}
                <code>supabase/migrations/README.md</code>-ben leírt egysoros SQL-lel — az
                appból az első admint nem lehet felvenni, mert ehhez a listához is admin kell.
              </EmptyState>
            )}
          </div>

          <div className="card p-3">
            {/* Két külön feladat, ezért két mód. A meghívás fiókot is készít, a
                szerepkör-adás viszont olyasvalakinek szól, aki már be tud lépni —
                egy gombbal a kettő összemosva az „a cím már regisztrált” hibát adná
                arra, ami valójában a helyes művelet. */}
            <div className="seg mb-3">
              <button className={mode === "invite" ? "on" : ""} onClick={() => { setMode("invite"); setErrMsg(""); }}>
                Meghívás
              </button>
              <button className={mode === "role" ? "on" : ""} onClick={() => { setMode("role"); setErrMsg(""); setInviteLink(""); }}>
                Csak szerepkör
              </button>
            </div>

            <Field
              label="E-mail-cím"
              hint={mode === "invite"
                ? "Erre a címre szól a meghívó. A fiók is elkészül — a Supabase-ben nem kell semmit csinálnod."
                : "Olyan cím, amelyhez már tartozik fiók. Itt csak a szerepkörét állítod be."}>
              <input type="email" className="inp" value={newEmail} placeholder="valaki@klub.hu"
                onChange={(e) => { setNewEmail(e.target.value); setInviteLink(""); }} />
            </Field>
            <Field label="Szerepkör">
              <select className="inp" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                <option value="sofor">Sofőr — csak a Sofőr fület látja</option>
                <option value="admin">Admin — mindent láthat és szerkeszthet</option>
              </select>
            </Field>

            {mode === "invite" ? (
              <button className="btn btn-pri" disabled={busy || !newEmail.trim()} onClick={invite}>
                <Mail size={17} /> {busy ? "Meghívó készítése…" : "Meghívó link készítése"}
              </button>
            ) : (
              <button className="btn btn-pri" disabled={busy || !newEmail.trim()} onClick={add}>
                <Plus size={17} /> Felvétel
              </button>
            )}

            {inviteLink && (
              <div className="banner banner-ok mt-3" style={{ display: "block" }}>
                <div className="font-semibold mb-1">Kész a meghívó link</div>
                <p className="text-sm mb-2" style={{ lineHeight: 1.5 }}>
                  Küldd el annak, akit meghívtál — e-mailben, üzenetben, ahogy szoktad.
                  A link <b>egyszer használható</b>, és <b>lejár</b>, ezért ha nem sikerül
                  időben, készíts újat. A megnyitása után a felhasználó maga adja meg a jelszavát.
                </p>
                {/* readOnly input és nem sima szöveg: a link hosszú, és így egy
                    koppintással kijelölhető ott is, ahol a vágólap API nem elérhető. */}
                <input className="inp" readOnly value={inviteLink} aria-label="Meghívó link"
                  onFocus={(e) => e.target.select()} style={{ fontSize: 13 }} />
                <button className="btn btn-ghost mt-2" onClick={copyLink}>
                  <Copy size={15} /> {copied ? "Kimásolva" : "Másolás"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
