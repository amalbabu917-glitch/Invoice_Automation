-- Invoice App — Postgres schema (Supabase-compatible)
--
-- Run this once against your database:
--   Supabase: Dashboard -> SQL Editor -> paste this file -> Run
--   psql:     psql "$DATABASE_URL" -f src/db/schema.sql
--   or:       npm run db:migrate   (runs this file via DATABASE_URL)
--
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / OR REPLACE).

create extension if not exists pgcrypto; -- provides gen_random_uuid()

-- ---------------------------------------------------------------------------
-- users: one row per registered business/owner account
-- ---------------------------------------------------------------------------
create table if not exists users (
  id                 uuid primary key default gen_random_uuid(),
  username           text not null,                 -- "User Name / Entity Name"
  business_type      text not null check (business_type in ('AMC', 'Service', 'Both')),
  address_line1      text not null,
  address_line2      text,
  address_line3      text,
  pincode            text not null,
  mobile             text not null unique,
  email              text,                           -- optional
  gstin              text,                           -- business's own GSTIN, optional;
                                                       -- presence flips "SERVICE BILL" -> "TAX INVOICE"
  password_hash      text not null,
  signature_path     text,                           -- e.g. /uploads/signatures/<file>; NULL if not uploaded
  reset_token         text,
  reset_token_expiry  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists idx_users_mobile on users (mobile);
create index if not exists idx_users_reset_token on users (reset_token) where reset_token is not null;

-- ---------------------------------------------------------------------------
-- invoices: one row per generated invoice
-- ---------------------------------------------------------------------------
create table if not exists invoices (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id) on delete cascade,
  invoice_number        text not null,                -- e.g. INV-2026-0001, unique per user
  invoice_date          date not null default current_date,
  service_type          text not null check (service_type in ('AMC', 'Service')),

  billed_to_name          text not null,
  billed_to_address_line1 text,
  billed_to_address_line2 text,
  billed_to_address_line3 text,
  billed_to_gstin          text,                       -- customer's GSTIN, optional
  billed_to_mobile         text,
  billed_to_email          text,

  items                 jsonb not null default '[]',  -- [{ "sno":1, "particular":"...", "amount": 100.00 }]

  taxable_amount        numeric(12,2) not null default 0,
  igst_rate             numeric(5,2)  not null default 0,
  igst_amount           numeric(12,2) not null default 0,
  cgst_rate             numeric(5,2)  not null default 0,
  cgst_amount           numeric(12,2) not null default 0,
  sgst_rate             numeric(5,2)  not null default 0,
  sgst_amount           numeric(12,2) not null default 0,
  total_amount          numeric(12,2) not null default 0,
  total_in_words        text,

  status                text not null default 'ACTIVE' check (status in ('ACTIVE', 'CANCELLED')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint uq_invoice_number_per_user unique (user_id, invoice_number)
);

create index if not exists idx_invoices_user_date on invoices (user_id, invoice_date);
create index if not exists idx_invoices_user_status on invoices (user_id, status);

-- ---------------------------------------------------------------------------
-- updated_at auto-touch trigger (both tables)
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

drop trigger if exists trg_invoices_updated_at on invoices;
create trigger trg_invoices_updated_at
  before update on invoices
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- session store table, exact shape required by connect-pg-simple
-- (kept in sync with node_modules/connect-pg-simple/table.sql)
-- ---------------------------------------------------------------------------
create table if not exists "session" (
  "sid"    varchar not null collate "default",
  "sess"   json    not null,
  "expire" timestamp(6) not null
);

alter table "session" drop constraint if exists "session_pkey";
alter table "session" add constraint "session_pkey" primary key ("sid") not deferrable initially immediate;

create index if not exists "IDX_session_expire" on "session" ("expire");
