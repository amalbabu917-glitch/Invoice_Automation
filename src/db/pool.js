const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and fill in your Supabase connection string.'
  );
}

// Supabase requires TLS. Their certs chain to a public CA, but on some
// networks/hosts the intermediate isn't in the local trust store, so we
// don't force strict verification by default. Set DATABASE_SSL=false only
// for a local Postgres without SSL.
const sslEnabled = process.env.DATABASE_SSL !== 'false';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  // Idle client errors (e.g. connection reset by Supabase pooler) shouldn't crash the process.
  console.error('Unexpected Postgres pool error:', err);
});

module.exports = pool;
