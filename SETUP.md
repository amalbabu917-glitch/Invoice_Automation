# Setup & transfer guide (Supabase / Postgres)

This app talks to Postgres through the standard `pg` driver — it works against
Supabase or any Postgres instance identically, via one connection string
(`DATABASE_URL`). Nothing in the code is Supabase-specific except the
connection string format, so "transferring" it later is just: point
`DATABASE_URL` at the new database and re-run the one schema file.

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard → New project.
2. Once it's provisioned: **Project Settings → Database → Connection string →
   URI**. Use the **pooled "Transaction" connection** (port `6543`, host
   `aws-0-<region>.pooler.supabase.com`, user `postgres.<project-ref>`) —
   **not** the direct connection (port `5432`, host
   `db.<project-ref>.supabase.co`).

   This isn't just a serverless-vs-long-lived-process choice: the direct host
   resolves to an **IPv6-only address**, and most hosting platforms have no
   outbound IPv6 route to it. This bit us for real deploying to Render — the
   app returned 500s on every DB query with `Error: connect ENETUNREACH
   <ipv6-address>:5432`. The pooler host is IPv4 and works everywhere,
   Render included, so it's the default recommendation now regardless of
   host type.
3. Copy that pooler URI into `DATABASE_URL` in your `.env` (see
   `.env.example`).

## 2. Apply the schema

The **entire database schema lives in one file**: [`src/db/schema.sql`](src/db/schema.sql).
It creates `users`, `invoices`, the `session` table (for login sessions), and
all indexes/triggers. It's idempotent — safe to run again after future edits.

Run it either from Supabase's dashboard or from the command line:

- **Supabase SQL Editor**: Dashboard → SQL Editor → New query → paste the
  contents of `src/db/schema.sql` → Run.
- **From this repo** (needs `DATABASE_URL` set in `.env`):
  ```bash
  npm install
  npm run db:migrate
  ```
  This runs `src/db/migrate.js`, which just executes `schema.sql` against
  `DATABASE_URL`.
- **psql directly**:
  ```bash
  psql "$DATABASE_URL" -f src/db/schema.sql
  ```

If you ever change the schema, edit `src/db/schema.sql` and re-run one of the
above — every statement uses `if not exists` / `or replace`, so it won't
error on objects that already exist, and it won't touch existing data.

## 3. Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase (or any Postgres) connection string |
| `DATABASE_SSL` | `true` for Supabase (default); `false` only for a local Postgres without TLS |
| `SESSION_SECRET` | Long random string, used to sign the session cookie |
| `PORT` | Port the app listens on (default 3000) |
| `APP_BASE_URL` | Public URL of the app — used in password-reset emails and to resolve the signature image when generating PDFs |
| `BUSINESS_GST_STATE_CODE` | Two-digit GST state code of the business (default `32` = Kerala) — determines the IGST vs CGST/SGST split rule |
| `SMTP_*` | Any SMTP provider, used to send password-reset links. If left unset, reset emails are printed to the server console instead of sent (fine for local dev, not for production) |

## 4. Run it

```bash
npm install
npm run db:migrate   # once, or whenever schema.sql changes
npm start             # or: npm run dev (auto-restarts on file changes)
```

Visit `http://localhost:3000/register` to create the first account.

## 5. Deploying to Render (get a real public URL)

GitHub Pages **cannot** host this — it only serves static files, and this is
a Node.js server (database connections, login sessions, and Puppeteer
launching headless Chrome for every PDF). It needs an actual host.
This repo includes a [`render.yaml`](render.yaml) Blueprint and a
[`Dockerfile`](Dockerfile) (Puppeteer's bundled Chromium needs a few system
libraries a bare Node image doesn't have — the Dockerfile installs them):

1. Go to [render.com](https://render.com) → sign in / create an account →
   **New → Blueprint**.
2. Connect your GitHub account and pick the `Invoice_Automation` repo.
   Render reads `render.yaml` automatically and shows the one service it
   defines (`invoice-automation`, Docker runtime).
3. You'll be prompted for the env vars marked `sync: false` in
   `render.yaml`: `DATABASE_URL` (your Supabase connection string),
   `APP_BASE_URL` (leave a placeholder for now — see step 5), and the
   `SMTP_*` values if you want real password-reset emails sent. Everything
   else (`SESSION_SECRET`, `PORT`, `BUSINESS_GST_STATE_CODE`, etc.) is
   already filled in or auto-generated.
4. Click **Apply** / **Deploy**. First build takes a few minutes (installing
   Chromium's dependencies + `npm ci`).
5. Once it's live, Render shows you a URL like
   `https://invoice-automation-xxxx.onrender.com`. Go back into the
   service's **Environment** tab, set `APP_BASE_URL` to that exact URL, and
   redeploy — it's used to build password-reset links and to resolve the
   signature image when generating PDFs.
6. Every future `git push` to `main` auto-redeploys.

**Free-tier caveats worth knowing:**
- The free plan spins the service down after inactivity — the first request
  after idling takes ~30-60s to cold-start.
- The container's filesystem is **ephemeral** — anything written to
  `public/uploads/signatures/` (uploaded signature images) is lost on every
  redeploy/restart. Fine for trying it out; for real use, either attach a
  paid [Render Disk](https://render.com/docs/disks) (mount it at
  `/app/public/uploads/signatures`), or move signature storage to **Supabase
  Storage** as described below — that's the more durable option since it
  doesn't depend on the app host's disk at all.

## 6. Transferring to your own repo/environment later

Since there's no vendor lock-in beyond "a Postgres connection string":

1. Push/clone this repo to wherever it needs to live.
2. Create (or reuse) a Supabase project, get its `DATABASE_URL`.
3. Run `npm run db:migrate` (or paste `schema.sql` into the SQL Editor) once
   against that database.
4. Set the environment variables from `.env.example` in the new hosting
   environment (Vercel/Railway/Render/your own server — wherever you deploy).
5. Deploy. No code changes needed.

**Uploaded signature images** are stored on local disk under
`public/uploads/signatures/`. That's fine for a single long-running server
with a persistent disk. If you move to a platform with an ephemeral
filesystem (serverless functions, containers that get rebuilt), swap
`src/utils/upload.js`'s disk storage for **Supabase Storage** (a bucket +
`@supabase/supabase-js` upload call) instead — the rest of the app only
depends on `users.signature_path` resolving to a URL, so that's a contained
change in one file plus the `signatureUrl()` helper.

## Notes on a couple of literal spec requirements worth knowing about

- **Password policy**: the spec calls for a 5–6 character password that
  must contain an uppercase letter, lowercase letter, digit, and special
  character (`src/utils/password.js`). That's implemented exactly as
  written, but a 4-character-class requirement inside a 5–6 character
  string leaves very little real entropy — it's a weak policy by normal
  standards. Worth revisiting (e.g. minimum 8–10 characters) if this ever
  handles real customer data.
- **IGST vs CGST/SGST rule**: per the spec, a "Billed To" GSTIN starting
  with the business's own state code (`32`/Kerala by default) gets
  CGST+SGST; anything else — including **no GSTIN at all** — gets IGST
  18%. That's slightly unusual (normally a same-state sale with no GSTIN
  would still be intrastate CGST+SGST), but it's implemented literally per
  `src/utils/gst.js`'s comments, since it was explicit in the source spec.
