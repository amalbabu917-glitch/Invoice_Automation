# Setup & transfer guide (Supabase / Postgres)

This app talks to Postgres through the standard `pg` driver — it works against
Supabase or any Postgres instance identically, via one connection string
(`DATABASE_URL`). Nothing in the code is Supabase-specific except the
connection string format, so "transferring" it later is just: point
`DATABASE_URL` at the new database and re-run the one schema file.

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard → New project.
2. Once it's provisioned: **Project Settings → Database → Connection string → URI**.
   - Use the **direct connection** (port `5432`) if you'll run this app as a
     long-lived Node process (a VM, Render, Railway, Fly.io, etc.).
   - Use the **pooled "Transaction" connection** (port `6543`) if you deploy
     to a serverless/edge platform (Vercel functions, AWS Lambda, etc.) —
     those need PgBouncer-style pooling because each invocation opens a new
     connection.
3. Copy that URI into `DATABASE_URL` in your `.env` (see `.env.example`).

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

## 5. Transferring to your own repo/environment later

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
