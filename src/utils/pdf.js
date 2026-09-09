const puppeteer = require('puppeteer');

let browserPromise = null;

// Reuse a single headless Chromium instance across requests instead of
// launching one per PDF (launching is the slow/expensive part).
function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

// Renders an HTML string to a PDF Buffer.
// `options` are passed straight to page.pdf() (format, landscape, margin, ...).
async function htmlToPdfBuffer(html, options = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
      ...options,
    });
    // Recent Puppeteer versions return a Uint8Array rather than a true Node
    // Buffer. Express's res.send() only special-cases Buffer.isBuffer(...) -
    // anything else falls through to res.json(), which would silently
    // serialize the raw bytes as a {"0":37,"1":80,...} JSON object instead
    // of sending the PDF. Coerce explicitly so callers can res.send() safely.
    return Buffer.from(buffer);
  } finally {
    await page.close();
  }
}

async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}

module.exports = { htmlToPdfBuffer, closeBrowser };
