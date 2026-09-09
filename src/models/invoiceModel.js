const pool = require('../db/pool');

async function nextInvoiceNumber(userId, year) {
  const { rows } = await pool.query(
    `select count(*)::int as n from invoices where user_id = $1 and extract(year from invoice_date) = $2`,
    [userId, year]
  );
  const seq = rows[0].n + 1;
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
}

async function createInvoice(userId, data) {
  const year = new Date(data.invoiceDate).getFullYear();

  // Small retry loop in case two invoices race for the same sequence number
  // (the unique (user_id, invoice_number) constraint is the real guard).
  for (let attempt = 0; attempt < 5; attempt++) {
    const invoiceNumber = await nextInvoiceNumber(userId, year);
    try {
      const { rows } = await pool.query(
        `insert into invoices
          (user_id, invoice_number, invoice_date, service_type,
           billed_to_name, billed_to_address_line1, billed_to_address_line2, billed_to_address_line3,
           billed_to_gstin, billed_to_mobile, billed_to_email,
           items, taxable_amount, igst_rate, igst_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
           total_amount, total_in_words, status)
         values
          ($1,$2,$3,$4,
           $5,$6,$7,$8,
           $9,$10,$11,
           $12,$13,$14,$15,$16,$17,$18,$19,
           $20,$21,'ACTIVE')
         returning *`,
        [
          userId,
          invoiceNumber,
          data.invoiceDate,
          data.serviceType,
          data.billedToName,
          data.billedToAddressLine1 || null,
          data.billedToAddressLine2 || null,
          data.billedToAddressLine3 || null,
          data.billedToGstin || null,
          data.billedToMobile || null,
          data.billedToEmail || null,
          JSON.stringify(data.items),
          data.taxableAmount,
          data.igstRate,
          data.igstAmount,
          data.cgstRate,
          data.cgstAmount,
          data.sgstRate,
          data.sgstAmount,
          data.totalAmount,
          data.totalInWords,
        ]
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') continue; // unique_violation on invoice_number, retry with next seq
      throw err;
    }
  }
  throw new Error('Could not allocate a unique invoice number after several attempts.');
}

async function findByIdForUser(id, userId) {
  const { rows } = await pool.query('select * from invoices where id = $1 and user_id = $2', [
    id,
    userId,
  ]);
  return rows[0] || null;
}

async function listRecentForUser(userId, limit = 20) {
  const { rows } = await pool.query(
    'select * from invoices where user_id = $1 order by invoice_date desc, created_at desc limit $2',
    [userId, limit]
  );
  return rows;
}

async function countAllForUser(userId) {
  // Total Invoices card: counts every status (ACTIVE, CANCELLED, any future status).
  const { rows } = await pool.query('select count(*)::int as n from invoices where user_id = $1', [
    userId,
  ]);
  return rows[0].n;
}

async function listForReport(userId, fromDate, toDate) {
  const { rows } = await pool.query(
    `select * from invoices
     where user_id = $1 and invoice_date between $2 and $3
     order by invoice_date asc, invoice_number asc`,
    [userId, fromDate, toDate]
  );
  return rows;
}

async function setStatus(id, userId, status) {
  const { rows } = await pool.query(
    `update invoices set status = $3 where id = $1 and user_id = $2 returning *`,
    [id, userId, status]
  );
  return rows[0] || null;
}

module.exports = {
  createInvoice,
  findByIdForUser,
  listRecentForUser,
  countAllForUser,
  listForReport,
  setStatus,
};
