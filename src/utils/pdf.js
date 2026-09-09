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
    return buffer;
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
