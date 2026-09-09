const pool = require('../db/pool');

const PUBLIC_COLUMNS = `
  id, username, business_type, address_line1, address_line2, address_line3,
  pincode, mobile, email, gstin, signature_path, created_at, updated_at
`;

async function createUser({
  username,
  businessType,
  addressLine1,
  addressLine2,
  addressLine3,
  pincode,
  mobile,
  email,
  gstin,
  passwordHash,
  signaturePath,
}) {
  const { rows } = await pool.query(
    `insert into users
      (username, business_type, address_line1, address_line2, address_line3,
       pincode, mobile, email, gstin, password_hash, signature_path)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning ${PUBLIC_COLUMNS}`,
    [
      username,
      businessType,
      addressLine1,
      addressLine2 || null,
      addressLine3 || null,
      pincode,
      mobile,
      email || null,
      gstin || null,
      passwordHash,
      signaturePath || null,
    ]
  );
  return rows[0];
}

async function findByMobile(mobile) {
  const { rows } = await pool.query('select * from users where mobile = $1', [mobile]);
  return rows[0] || null;
}

async function findByEmail(email) {
  if (!email) return null;
  const { rows } = await pool.query('select * from users where email = $1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query(`select ${PUBLIC_COLUMNS} from users where id = $1`, [id]);
  return rows[0] || null;
}

// Full row (includes password_hash, signature_path, gstin) — for internal use
// (auth checks, invoice rendering, profile edit form pre-fill).
async function findFullById(id) {
  const { rows } = await pool.query('select * from users where id = $1', [id]);
  return rows[0] || null;
}

async function updateProfile(
  id,
  { addressLine1, addressLine2, addressLine3, pincode, mobile, gstin, email }
) {
  const { rows } = await pool.query(
    `update users set
       address_line1 = $2,
       address_line2 = $3,
       address_line3 = $4,
       pincode = $5,
       mobile = $6,
       gstin = $7,
       email = $8
     where id = $1
     returning ${PUBLIC_COLUMNS}`,
    [
      id,
      addressLine1,
      addressLine2 || null,
      addressLine3 || null,
      pincode,
      mobile,
      gstin || null,
      email || null,
    ]
  );
  return rows[0] || null;
}

async function updateSignaturePath(id, signaturePath) {
  await pool.query('update users set signature_path = $2 where id = $1', [id, signaturePath]);
}

async function setResetToken(id, token, expiry) {
  await pool.query('update users set reset_token = $2, reset_token_expiry = $3 where id = $1', [
    id,
    token,
    expiry,
  ]);
}

async function findByResetToken(token) {
  const { rows } = await pool.query(
    'select * from users where reset_token = $1 and reset_token_expiry > now()',
    [token]
  );
  return rows[0] || null;
}

async function resetPassword(id, passwordHash) {
  await pool.query(
    `update users set password_hash = $2, reset_token = null, reset_token_expiry = null where id = $1`,
    [id, passwordHash]
  );
}

module.exports = {
  createUser,
  findByMobile,
  findByEmail,
  findById,
  findFullById,
  updateProfile,
  updateSignaturePath,
  setResetToken,
  findByResetToken,
  resetPassword,
};
