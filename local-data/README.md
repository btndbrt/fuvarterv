# Local test data

`npm run dev:local` runs the app on a snapshot of the live data, with no Supabase at
all. Put the snapshot here as **`state.json`**. Everything in this folder except this
README is gitignored, because the snapshot holds the club's real names, phone numbers
and e-mail addresses. Never commit it.

## Getting the snapshot

In the Supabase dashboard, open **SQL Editor** and run:

```sql
select data from app_state where id = 'fuvarterv:v1';
```

Copy the result (**Copy → Copy as JSON**, or copy the single cell) and save it as
`local-data/state.json`. Any of these shapes works: the bare state blob, an
`app_state` row, or the editor's array of rows.

## Using it

```bash
npm run dev:local          # http://localhost:5173
```

- You are signed in as an admin, with no login.
- An orange **HELYI TESZT** bar is always on top, so it can't be mistaken for the live app.
- The first load reads `state.json`. Every change is saved to this browser's
  localStorage only, and later loads use that copy.
- **Újratöltés a fájlból** drops the browser copy and starts again from `state.json`.
- **Munkapéldány letöltése** downloads the current working copy, to inspect or compare.
- To open it on a phone or another computer on the same network, run
  `npm run dev:local:lan` instead, and use the **Network** address Vite prints (e.g.
  `http://192.168.1.21:5173`). Only do this on a network you trust: there is no login,
  and anyone who can reach that address can download `state.json` with the club's
  personal data. Stop it (Ctrl-C) when you are done. If the page doesn't open from the
  other device, the computer's firewall may be blocking the port (e.g. `sudo ufw allow
  5173/tcp`).
- The Supabase client is switched off in this mode even if `.env` has the live
  credentials. Features that need the server (users and invites, saved versions) say
  they have no connection.
