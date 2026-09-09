// GST calculation rule, exactly as specified in the client document:
//
//   - If the customer's ("Billed To") GSTIN is present AND its first two
//     digits equal the business's own state code (BUSINESS_GST_STATE_CODE,
//     default "32" = Kerala) => intrastate => CGST 9% + SGST 9%, no IGST.
//   - Otherwise (GSTIN missing/NIL, OR first two digits differ from the
//     business's state code) => interstate => IGST 18%, no CGST/SGST.
//
// This is the literal client rule (spec section "CONFIGURATION TO BE DONE").
// It differs from normal GST practice (a B2C sale with no GSTIN at all is
// still normally intrastate CGST+SGST if buyer and seller are in the same
// state) — implemented as written since it was explicit in the source doc.
const BUSINESS_STATE_CODE = process.env.BUSINESS_GST_STATE_CODE || '32';

const IGST_RATE = 18;
const CGST_RATE = 9;
const SGST_RATE = 9;

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calculateGst(taxableAmount, billedToGstin) {
  const gstin = (billedToGstin || '').trim().toUpperCase();
  const stateCode = gstin.slice(0, 2);
  const amount = Number(taxableAmount) || 0;

  let igstRate = 0,
    igstAmount = 0,
    cgstRate = 0,
    cgstAmount = 0,
    sgstRate = 0,
    sgstAmount = 0;

  if (gstin && stateCode === BUSINESS_STATE_CODE) {
    cgstRate = CGST_RATE;
    sgstRate = SGST_RATE;
    cgstAmount = round2((amount * CGST_RATE) / 100);
    sgstAmount = round2((amount * SGST_RATE) / 100);
  } else {
    igstRate = IGST_RATE;
    igstAmount = round2((amount * IGST_RATE) / 100);
  }

  const totalAmount = round2(amount + igstAmount + cgstAmount + sgstAmount);

  return {
    igstRate,
    igstAmount,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    totalAmount,
  };
}

module.exports = { calculateGst, round2, BUSINESS_STATE_CODE };
