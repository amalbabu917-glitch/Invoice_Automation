// Converts a rupee amount to words using the Indian numbering system
// (Crore / Lakh / Thousand), e.g. 123456.75 -> "One Lakh Twenty Three
// Thousand Four Hundred Fifty Six Rupees and Seventy Five Paise Only".

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? ' ' + ONES[o] : '');
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = '';
  if (h) out += ONES[h] + ' Hundred';
  if (rest) out += (out ? ' ' : '') + twoDigits(rest);
  return out;
}

function integerToWords(num) {
  if (num === 0) return 'Zero';
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = num;

  const parts = [];
  if (crore) parts.push(threeDigits(crore) + ' Crore');
  if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
  if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(' ');
}

function amountInWords(amount) {
  const n = Number(amount) || 0;
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);

  let words = `${integerToWords(rupees)} Rupees`;
  if (paise > 0) {
    words += ` and ${integerToWords(paise)} Paise`;
  }
  words += ' Only';
  return words;
}

module.exports = { amountInWords };
