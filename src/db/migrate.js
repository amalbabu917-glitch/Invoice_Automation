// Applies src/db/schema.sql to the database at DATABASE_URL.
// Usage: npm run db:migrate
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Applying src/db/schema.sql to', maskUrl(process.env.DATABASE_URL), '...');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('Schema applied successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

function maskUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
