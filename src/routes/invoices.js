const express = require('express');
const path = require('path');
const ejs = require('ejs');
const router = express.Router();

const userModel = require('../models/userModel');
const invoiceModel = require('../models/invoiceModel');
const { requireAuth } = require('../middleware/auth');
const { calculateGst } = require('../utils/gst');
const { amountInWords } = require('../utils/numberToWords');
const { signatureUrl } = require('../utils/upload');
const { htmlToPdfBuffer } = require('../utils/pdf');

const VIEWS_DIR = path.join(__dirname, '..', '..', 'views');

// Keeps the printed invoice on a single A4 page (per spec's "SINGLE PAGE" section).
const MAX_ITEMS_PER_INVOICE = 15;

router.get('/invoices/new', requireAuth, (req, res) => {
  res.render('create-invoice', { error: null, form: {} });
});

router.post('/invoices', requireAuth, async (req, res, next) => {
  try {
    const {
      invoiceDate,
      serviceType,
      billedToName,
      billedToAddressLine1,
      billedToAddressLine2,
      billedToAddressLine3,
      billedToGstin,
      billedToMobile,
      billedToEmail,
    } = req.body;

    const particulars = [].concat(req.body.particular || []);
    const amounts = [].concat(req.body.amount || []);

    const items = particulars
      .map((particular, i) => ({ particular: (particular || '').trim(), amount: Number(amounts[i]) || 0 }))
      .filter((it) => it.particular && it.amount > 0)
      .map((it, i) => ({ sno: i + 1, particular: it.particular, amount: it.amount }));

    if (!billedToName || !invoiceDate || !serviceType || items.length === 0) {
      return res.render('create-invoice', {
        error: 'Please provide the client name, date, service type, and at least one line item.',
        form: req.body,
      });
    }
    if (items.length > MAX_ITEMS_PER_INVOICE) {
      return res.render('create-invoice', {
        error: `A single invoice supports at most ${MAX_ITEMS_PER_INVOICE} line items, to keep it on one A4 page.`,
        form: req.body,
      });
    }

    const taxableAmount = items.reduce((sum, it) => sum + it.amount, 0);

    // GST breakdown (IGST vs CGST/SGST) only applies once the business itself
    // has a GSTIN on file - that's also what flips the heading to "TAX INVOICE".
    // Without one, the invoice is a plain "SERVICE BILL" with no tax lines.
    const businessUser = await userModel.findFullById(req.session.userId);
    const gst = businessUser.gstin
      ? calculateGst(taxableAmount, billedToGstin)
      : { igstRate: 0, igstAmount: 0, cgstRate: 0, cgstAmount: 0, sgstRate: 0, sgstAmount: 0, totalAmount: taxableAmount };
    const totalInWords = amountInWords(gst.totalAmount);

    const invoice = await invoiceModel.createInvoice(req.session.userId, {
      invoiceDate,
      serviceType,
      billedToName: billedToName.trim(),
      billedToAddressLine1,
      billedToAddressLine2,
      billedToAddressLine3,
      billedToGstin: billedToGstin ? billedToGstin.trim().toUpperCase() : null,
      billedToMobile,
      billedToEmail,
      items,
      taxableAmount,
      igstRate: gst.igstRate,
      igstAmount: gst.igstAmount,
      cgstRate: gst.cgstRate,
      cgstAmount: gst.cgstAmount,
      sgstRate: gst.sgstRate,
      sgstAmount: gst.sgstAmount,
      totalAmount: gst.totalAmount,
      totalInWords,
    });

    res.redirect(`/invoices/${invoice.id}`);
  } catch (err) {
    next(err);
  }
});

const TARGET_ROW_COUNT = 8; // visual padding target for the items table on a mostly-empty invoice

async function loadInvoiceViewData(req, res) {
  const invoice = await invoiceModel.findByIdForUser(req.params.id, req.session.userId);
  if (!invoice) return null;
  const user = await userModel.findFullById(req.session.userId);
  const items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : invoice.items;
  return {
    invoice,
    items,
    fillerRows: Math.max(0, TARGET_ROW_COUNT - items.length),
    user,
    // "SERVICE BILL" becomes "TAX INVOICE" once the business itself has a GSTIN on file.
    heading: user.gstin ? 'TAX INVOICE' : 'SERVICE BILL',
    signatureUrl: signatureUrl(user.signature_path),
    appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  };
}

router.get('/invoices/:id', requireAuth, async (req, res, next) => {
  try {
    const data = await loadInvoiceViewData(req, res);
    if (!data) return res.status(404).render('invoice-view', { notFound: true, printMode: false });
    res.render('invoice-view', { ...data, notFound: false, printMode: false });
  } catch (err) {
    next(err);
  }
});

router.get('/invoices/:id/pdf', requireAuth, async (req, res, next) => {
  try {
    const data = await loadInvoiceViewData(req, res);
    if (!data) return res.status(404).send('Invoice not found.');

    const html = await ejs.renderFile(path.join(VIEWS_DIR, 'invoice-view.ejs'), {
      ...data,
      notFound: false,
      printMode: true,
    });
    const pdfBuffer = await htmlToPdfBuffer(html, { format: 'A4', printBackground: true });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${data.invoice.invoice_number}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

router.post('/invoices/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const invoice = await invoiceModel.setStatus(req.params.id, req.session.userId, 'CANCELLED');
    if (!invoice) return res.status(404).send('Invoice not found.');
    res.redirect(`/invoices/${invoice.id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
