const express = require('express');
const path = require('path');
const ejs = require('ejs');
const ExcelJS = require('exceljs');
const router = express.Router();

const invoiceModel = require('../models/invoiceModel');
const { requireAuth } = require('../middleware/auth');
const { htmlToPdfBuffer } = require('../utils/pdf');

const VIEWS_DIR = path.join(__dirname, '..', '..', 'views');

function summarize(invoices) {
  const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
  return { count: invoices.length, totalAmount };
}

router.get('/report', requireAuth, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    let invoices = null;
    let summary = null;
    if (from && to) {
      invoices = await invoiceModel.listForReport(req.session.userId, from, to);
      summary = summarize(invoices);
    }
    res.render('report', { from: from || '', to: to || '', invoices, summary, error: null });
  } catch (err) {
    next(err);
  }
});

function requireDateRange(req, res) {
  const { from, to } = req.query;
  if (!from || !to) {
    res.status(400).send('Both "from" and "to" dates are required.');
    return null;
  }
  return { from, to };
}

router.get('/report/export/excel', requireAuth, async (req, res, next) => {
  try {
    const range = requireDateRange(req, res);
    if (!range) return;
    const invoices = await invoiceModel.listForReport(req.session.userId, range.from, range.to);
    const summary = summarize(invoices);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Invoice Report');

    sheet.columns = [
      { header: 'Invoice Number', key: 'invoice_number', width: 18 },
      { header: 'Invoice Date', key: 'invoice_date', width: 14 },
      { header: 'Billed To', key: 'billed_to_name', width: 24 },
      { header: 'GSTIN', key: 'billed_to_gstin', width: 18 },
      { header: 'Taxable Amount', key: 'taxable_amount', width: 16 },
      { header: 'IGST 18%', key: 'igst_amount', width: 12 },
      { header: 'CGST 9%', key: 'cgst_amount', width: 12 },
      { header: 'SGST 9%', key: 'sgst_amount', width: 12 },
      { header: 'Total', key: 'total_amount', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Remark', key: 'remark', width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const inv of invoices) {
      sheet.addRow({
        invoice_number: inv.invoice_number,
        invoice_date: new Date(inv.invoice_date).toLocaleDateString('en-IN'),
        billed_to_name: inv.billed_to_name,
        billed_to_gstin: inv.billed_to_gstin || '',
        taxable_amount: Number(inv.taxable_amount),
        igst_amount: Number(inv.igst_amount),
        cgst_amount: Number(inv.cgst_amount),
        sgst_amount: Number(inv.sgst_amount),
        total_amount: Number(inv.total_amount),
        status: inv.status,
        // Cancelled invoices stay in the report (not removed) with a Remark, per spec.
        remark: inv.status === 'CANCELLED' ? 'CANCELLED' : '',
      });
    }

    sheet.addRow({}); // spacer
    const summaryRow = sheet.addRow({
      invoice_number: `Total Invoices: ${summary.count}`,
      total_amount: summary.totalAmount,
    });
    summaryRow.font = { bold: true };

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Invoice_Report_${range.from}_${range.to}.xlsx"`,
    });
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

router.get('/report/export/pdf', requireAuth, async (req, res, next) => {
  try {
    const range = requireDateRange(req, res);
    if (!range) return;
    const invoices = await invoiceModel.listForReport(req.session.userId, range.from, range.to);
    const summary = summarize(invoices);

    const html = await ejs.renderFile(path.join(VIEWS_DIR, 'report-pdf.ejs'), {
      from: range.from,
      to: range.to,
      invoices,
      summary,
    });
    const pdfBuffer = await htmlToPdfBuffer(html, { format: 'A4', landscape: true, printBackground: true });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Invoice_Report_${range.from}_${range.to}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
