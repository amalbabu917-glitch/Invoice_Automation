# Invoice Automation

Invoice generation web app for AMC/Service businesses: registration & login,
GST-aware "SERVICE BILL" / "TAX INVOICE" generation with auto-calculated
IGST/CGST/SGST, optional signature upload, single-page A4 PDF export, a
dashboard, and date-range reports exportable to Excel/PDF.

- **Stack**: Node.js, Express, EJS (server-rendered views), Postgres (Supabase).
- **PDF generation**: Puppeteer (headless Chromium), rendering the same EJS
  invoice template used for the on-screen view.
- **Excel export**: ExcelJS.

## Quick start

See [`SETUP.md`](SETUP.md) for full Supabase provisioning, schema, and
environment variable instructions. Short version:

```bash
cp .env.example .env   # fill in DATABASE_URL, SESSION_SECRET, etc.
npm install
npm run db:migrate
npm start
```

Then open `http://localhost:3000/register`.

## Project layout

```
src/
  app.js              Express app + session/middleware wiring
  db/
    schema.sql        The entire database schema (Postgres) — source of truth
    migrate.js         Applies schema.sql to DATABASE_URL
    pool.js             pg connection pool
  models/               Query functions (users, invoices) — no ORM
  routes/                auth, profile, invoices, dashboard, report
  utils/
    password.js         Password policy + hashing (bcrypt)
    gst.js              IGST/CGST/SGST calculation rule
    numberToWords.js     Rupee amount → words (Indian numbering system)
    email.js             Password-reset email sending (SMTP, or console fallback)
    upload.js            Signature image upload handling (multer)
    pdf.js               HTML → PDF via Puppeteer
views/                   EJS templates (one per page)
public/                  Static assets + uploaded signature images
```

## Feature notes

- **GST heading & tax lines**: an invoice is a plain "SERVICE BILL" until the
  business itself has a GSTIN on file (Profile Settings); once it does,
  invoices become "TAX INVOICE" with the IGST/CGST/SGST breakdown per
  `src/utils/gst.js`.
- **Single-page PDF**: invoices are capped at 15 line items
  (`MAX_ITEMS_PER_INVOICE` in `src/routes/invoices.js`) and rendered in a
  fixed 210mm×297mm container so they always print to one A4 page.
- **Cancelled invoices** are never deleted — they stay in the dashboard count
  and in reports, flagged with a `CANCELLED` status/remark.
- **Forgot password** uses a 15-minute expiring token emailed as a reset
  link (not OTP), and never reveals whether an email exists on the system.

See [`SETUP.md`](SETUP.md) for two spec requirements (password policy length,
and the IGST/CGST/SGST GSTIN rule) that are implemented literally as written
but are worth a second look.
