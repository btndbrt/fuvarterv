# Fuvarterv — maintenance handbook

The practical document: what to run, what to check, and what to watch out for when you
touch the code. The "why is it like this" belongs to
[`ARCHITECTURE.md`](ARCHITECTURE.md) and [`DECISIONS.md`](DECISIONS.md).

---

## 1. Development environment

Node **20 or newer** (`engines` in `package.json`; the deployed build pins its own
version through `NODE_VERSION` in `netlify.toml`).

```bash
cp .env.example .env      # VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # http://localhost:5173
```

Or in one step, installing Node as well: `./run-local.sh`.

| Command | What it does |
|---|---|
| `npm run dev` | the Vite dev server |
| `npm test` | Vitest, one run (19 files, 168 tests) |
| `npm run lint` | ESLint (flat config) |
| `npm run build` | a production build into `dist/`, with sourcemaps |
| `npm run preview` | serve the built bundle |

CI (`.github/workflows/ci.yml`) runs `npm ci → lint → test → build` for every branch and
pull request, on **Node 20 and 22**. `npm ci` installs strictly from the lockfile, which
is the step that stops a broken lockfile reaching a deployment.

> **You can develop without Supabase**, up to a point: the tests supply a stub
> `window.storage`, and with no configuration the app shows its "missing configuration"
> screen. Real clicking around needs a Supabase project (see the README).

---

## 2. Code conventions

**File headers.** Every module opens with a short header: what this file is and what its
role in the system is. Keep the format for new modules.

**A comment explains *why*.** In this codebase a long comment is not an apology for
unclear code. It is **a description of the wrong behaviour that was ruled out**:

```js
// BOTH coordinates are required. Checking only lat lets haversine return NaN,
// and Math.max(1, NaN) is NaN too — that then runs through the whole timetable,
// makes every comparison false (no edge is built, no clash is visible), and
// prints times as "NaN:NaN".
```

When you fix a bug, the fix gets a comment like that **and** a test. What the code does is
readable from the code; what happened when it did not do that is only readable here.

**Language.** The user interface is Hungarian, everything else is English (ADR-25). Two
Hungarian words stay as stored data values and must not be renamed: the ride directions
`oda` and `vissza`, and the role `sofor`.

**Style.** Two-space indentation, semicolons, double quotes, trailing commas in multi-line
literals. Follow the surrounding code. There is no Prettier config, and the lint only
catches real defects.

**React.**
- Define components at **module level**. A component defined inside a render function is a
  new type on every render and loses its state.
- Refresh an editor form's draft by remounting with a `key` prop, not by hand-syncing.
- `update(fn)` is always a **pure** transform, never an in-place mutation.

**Domain.** Keep `src/domain/` pure: no `window`, no network, and no `Math.random()` on a
decision path. The optimizer's determinism rests on that.

---

## 3. When is a change done?

A checklist to run before committing.

- [ ] `npm run lint` and `npm test` are green.
- [ ] A new field has a default in **`ensureShape`** that reproduces the **previous**
      behaviour (E8, ADR-05).
- [ ] If the data became referenceable, **`deleteGuard`** counts it (I10).
- [ ] A new optimizer constraint has an **explanation** (ADR-24), and if it is a cost term
      it is **also in `skelCost`** (the golden rule in ADR-15).
- [ ] A bug fix comes with a **regression test** describing the wrong behaviour it rules
      out.
- [ ] A new external call has a **CSP** directive in `netlify.toml` and a fallback path
      (E5).
- [ ] If you touched the load or save path, sample data still cannot be seeded over real
      data (I11, in the spirit of `test/load-error.test.js`).

---

## 4. What to ask in review

The most common and most expensive classes of mistake in this system.

| Question | Why |
|---|---|
| Does the new field affect travel time or cost? | then it has to appear consistently in every optimisation phase |
| New constraint: hard or soft? | a hard one excludes from the option list, a soft one only raises the price. Mixing them up produces bad proposals |
| Does the headcount handling distinguish `""` from `0`? | I4, ADR-23. This is the "children left at the stop" class |
| Return leg: mirrored, or its own list? | `legFor` is the **only** place that decides. Do not decide it again elsewhere |
| Does every task still land in exactly one chain? | I5, checked by the property test in `optimizer.test.js` |
| Does the write path still run only for an admin? | ADR-11. The UI guard is not protection, but it is what avoids a pointless error on every session |
| Is the new component defined inside a render function? | state loss and needless remounting |

---

## 5. The database

The whole server side is one file,
[`supabase/migrations/0001_initial_schema.sql`](../supabase/migrations/0001_initial_schema.sql),
run in the Supabase **SQL editor**. It is re-runnable.

To change the schema, edit that file and re-run it. Write everything to be re-runnable:
`create table if not exists`, and a `drop policy if exists` before every `create policy`
(`create policy` has no `if not exists`, and the SQL editor is not one transaction, so a
re-run can otherwise stop half-way).

The workspace key lives in two places that must agree: `workspace_id()` in the schema, and
`STORAGE_KEY` in `src/data/storage.js`. If they disagree, the app loads an empty workspace
and every save is rejected.

**Two settings are not in the repo but are part of the security model** (ADR-11):

- Authentication → Providers → Email → **Enable sign-ups: OFF**.
- The first admin's row in `user_roles`. The schema file's footer has the statement, and
  it doubles as the recovery path if the admins lock themselves out.

`supabase/migrations/README.md` has a read-only query that tells you what is applied.

### Keeping the project awake

A free-tier Supabase project is **paused after about a week without requests**, and
restoring it is a manual click in the dashboard — so a quiet school holiday is enough for
the club to come back to a dead app. [`.github/workflows/keepalive.yml`](../.github/workflows/keepalive.yml)
sends one anon REST read a day to prevent that.

It needs two **repository secrets** (Settings → Secrets and variables → Actions):
`SUPABASE_URL` and `SUPABASE_ANON_KEY` — the same values Netlify holds. Both are public by
design (Vite inlines them into the bundle), so the secrets are tidiness, not protection.
Without them the workflow fails immediately with a message saying so, rather than passing
while pinging nothing.

**The trap.** GitHub **disables scheduled workflows after 60 days of repository
inactivity**, and emails the owner a link to re-enable them. A keepalive is exactly the
thing that dies this way, because the repository is quiet for the same reason the database
is. If the app has had no commits for two months, check Actions before trusting the ping.
Running it by hand (**Run workflow** on the Actions tab) also resets the clock.

Use **Run workflow** after any change to the anon key or the RLS policies: a non-200 is
reported as a failure, and the log distinguishes a 401 (wrong key) from a 5xx or timeout
(project already paused).

---

## 6. Releasing (Netlify)

1. Check that the schema is applied and public sign-ups are off.
2. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set under **Site configuration →
   Environment variables**, for **all deploy contexts** so Deploy Previews get them too.
   Vite inlines them **at build time**: adding them afterwards requires a redeploy.
3. `SUPABASE_SERVICE_ROLE_KEY` is set in Netlify — **only** there, never in `.env` and
   never `VITE_`-prefixed. Without it the Users panel reports that the invite function is
   not configured; with it in the wrong place it is in the public bundle and the database
   is open to anyone who looks (ADR-30).
4. In Supabase, **Authentication → URL Configuration**: the Site URL and Redirect URLs
   include the deployed address. Invite links come back to `/?invite=1` and Supabase will
   not redirect to an address that is not listed.
5. Deploy Preview → the manual checks below → merge.

`netlify.toml` carries the build command, the publish directory, the `NODE_VERSION`, the
SPA redirect and every security header. A host that serves the built `dist/` without it
serves the app **unprotected and with broken deep links**, and nothing about the running
app looks wrong — so treat that file as part of the release, not as configuration noise.

**Manual checkpoints the automated tests do not cover:**

- Sign in with a real account, and with a driver account too (only the driver tab shows).
- Open the map picker on the Deploy Preview and **watch the browser console**. This is
  where a CSP conflict with Leaflet's styles would surface (ADR-21).
- Run "matrix calculation" and read the message: it says whether the result came from OSRM
  or from an estimate.
- Save once, then open the snapshot panel. If it stays empty, the history table is missing.
- **Adatok → Felhasználók → Meghívás**: make a link for a throwaway address and open it in a
  private window. It must land on the "Válassz jelszót" screen, not on the login form. This
  is the only check that exercises the function, the redirect allowlist and the
  `?invite=1` marker together — and each of the three fails differently.

---

## 7. Troubleshooting

| Symptom | Likely cause | Where to look |
|---|---|---|
| The "missing configuration" screen | no `.env`, or Netlify's variables were added after the build | `src/supabaseClient.js` |
| The "changed elsewhere" overlay | somebody else saved, or a genuine conflict after a lost response | `supabaseStorage.doSet` (ADR-06, ADR-07) |
| Every save rejected, empty workspace | the workspace key does not match between client and schema | `supabase/migrations/README.md` |
| The snapshot list is always empty | the history table is missing | the error branch in `RestorePanel` |
| Everyone looks like an admin | the `user_roles` table does not exist | `fetchRole`'s exception branch (ADR-10) |
| The schedule's chains vanished | stops or headcounts changed, so task ids went stale | `resolveDay`'s `droppedChains` (R1) |
| A "matrix is stale" flag | a coordinate changed since the matrix was computed | `matrixKey` |
| Oddly short travel times | a point with no coordinate, falling back to `fallbackLegMin` | `legMin`, the coordinate requirement in `MasterForm` |
| Optimisation prints a "heuristic" note | the search hit its 30,000-iteration cap | `assignResources` (`capped`) |
| "A meghívó funkció nem érhető el" | running locally (`npm run dev` has no functions), or `/api/*` is matched after the SPA rule | `netlify.toml` redirect order |
| Invite link opens the login form | the address is not in Supabase's Redirect URLs, so `?invite=1` was dropped | Authentication → URL Configuration |
| An error card instead of a white screen | the `ErrorBoundary` caught a render error; the full stack is in the console | `src/ErrorBoundary.jsx` |

Production builds ship sourcemaps, so a stack trace from a user's console points at real
files and lines.

---

## 8. Privacy

The sample data in `src/data/seed.js` is **fictional**: placeholder driver names and
plates, with real public places as stations and venues so the distances stay realistic.
Keep it that way. Real names, phone numbers and plates belong in the running workspace,
never in the repository.

Driver e-mail addresses live in the workspace blob, which means they are readable by every
authenticated user. That is intentional (the driver list is not a secret within the club),
but it is worth knowing before adding anything more sensitive to a driver record.
