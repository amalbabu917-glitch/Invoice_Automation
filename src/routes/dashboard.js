const express = require('express');
const router = express.Router();

const invoiceModel = require('../models/invoiceModel');
const { requireAuth } = require('../middleware/auth');

router.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const [totalInvoices, recentInvoices] = await Promise.all([
      invoiceModel.countAllForUser(req.session.userId), // all statuses, per spec
      invoiceModel.listRecentForUser(req.session.userId, 20),
    ]);
    res.render('dashboard', { totalInvoices, recentInvoices });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, (req, res) => res.redirect('/dashboard'));

module.exports = router;
