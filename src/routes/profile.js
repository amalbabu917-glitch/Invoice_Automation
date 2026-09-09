const express = require('express');
const router = express.Router();

const userModel = require('../models/userModel');
const { requireAuth } = require('../middleware/auth');
const { signatureUpload, deleteSignatureFile } = require('../utils/upload');

router.get('/profile', requireAuth, async (req, res) => {
  const user = await userModel.findFullById(req.session.userId);
  res.render('profile', { user, error: null, success: null });
});

router.post('/profile', requireAuth, (req, res, next) => {
  signatureUpload.single('signature')(req, res, (err) => {
    if (err) {
      return handleError(req, res, err.message);
    }
    handleUpdate(req, res).catch(next);
  });
});

async function handleError(req, res, error) {
  const user = await userModel.findFullById(req.session.userId);
  res.render('profile', { user, error, success: null });
}

async function handleUpdate(req, res) {
  const { addressLine1, addressLine2, addressLine3, pincode, mobile, gstin, email } = req.body;

  if (!addressLine1 || !pincode || !mobile) {
    return handleError(req, res, 'Address line 1, pincode, and mobile number are required.');
  }

  const current = await userModel.findFullById(req.session.userId);

  // Mobile number must stay unique across accounts.
  if (mobile.trim() !== current.mobile) {
    const existing = await userModel.findByMobile(mobile.trim());
    if (existing && existing.id !== current.id) {
      return handleError(req, res, 'Another account already uses that mobile number.');
    }
  }

  try {
    const updated = await userModel.updateProfile(req.session.userId, {
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2 ? addressLine2.trim() : null,
      addressLine3: addressLine3 ? addressLine3.trim() : null,
      pincode: pincode.trim(),
      mobile: mobile.trim(),
      gstin: gstin ? gstin.trim().toUpperCase() : null,
      email: email ? email.trim() : null,
    });

    if (req.file) {
      const oldSignature = current.signature_path;
      await userModel.updateSignaturePath(req.session.userId, req.file.filename);
      if (oldSignature) deleteSignatureFile(oldSignature);
    }

    const user = await userModel.findFullById(req.session.userId);
    res.render('profile', { user, error: null, success: 'Profile updated successfully.' });
  } catch (err) {
    if (err.code === '23505') {
      return handleError(req, res, 'Another account already uses that mobile number.');
    }
    throw err;
  }
}

module.exports = router;
