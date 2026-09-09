const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const userModel = require('../models/userModel');
const { redirectIfAuthed } = require('../middleware/auth');
const { validatePassword, passwordRequirementsMessage, hashPassword, comparePassword } = require('../utils/password');
const { signatureUpload, signatureUrl, deleteSignatureFile } = require('../utils/upload');
const { sendMail } = require('../utils/email');

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes, per spec

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
router.get('/register', redirectIfAuthed, (req, res) => {
  res.render('register', { error: null, form: {} });
});

router.post('/register', redirectIfAuthed, (req, res, next) => {
  signatureUpload.single('signature')(req, res, (err) => {
    if (err) {
      return res.render('register', { error: err.message, form: req.body });
    }
    handleRegister(req, res).catch(next);
  });
});

async function handleRegister(req, res) {
  const {
    username,
    businessType,
    addressLine1,
    addressLine2,
    addressLine3,
    pincode,
    mobile,
    email,
    gstin,
    password,
    confirmPassword,
  } = req.body;

  const rerender = (error) => {
    if (req.file) deleteSignatureFile(req.file.filename);
    return res.render('register', { error, form: req.body });
  };

  if (!username || !businessType || !addressLine1 || !pincode || !mobile) {
    return rerender('Please fill in all required fields.');
  }
  if (!['AMC', 'Service', 'Both'].includes(businessType)) {
    return rerender('Please choose a valid business/service model.');
  }
  if (!validatePassword(password)) {
    return rerender(passwordRequirementsMessage());
  }
  if (password !== confirmPassword) {
    return rerender('Password and confirm password do not match.');
  }

  const existing = await userModel.findByMobile(mobile.trim());
  if (existing) {
    return rerender('An account with this mobile number already exists.');
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await userModel.createUser({
      username: username.trim(),
      businessType,
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2 ? addressLine2.trim() : null,
      addressLine3: addressLine3 ? addressLine3.trim() : null,
      pincode: pincode.trim(),
      mobile: mobile.trim(),
      email: email ? email.trim() : null,
      gstin: gstin ? gstin.trim().toUpperCase() : null,
      passwordHash,
      signaturePath: req.file ? req.file.filename : null,
    });
    req.session.userId = user.id;
    res.redirect('/dashboard');
  } catch (err) {
    if (err.code === '23505') {
      return rerender('An account with this mobile number already exists.');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------
router.get('/login', redirectIfAuthed, (req, res) => {
  res.render('login', { error: null, mobile: '' });
});

router.post('/login', redirectIfAuthed, async (req, res) => {
  const { mobile, password } = req.body;
  const user = mobile ? await userModel.findByMobile(mobile.trim()) : null;
  if (!user || !(await comparePassword(password || '', user.password_hash))) {
    return res.render('login', { error: 'Invalid mobile number or password.', mobile: mobile || '' });
  }
  req.session.userId = user.id;
  res.redirect('/dashboard');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------
router.get('/forgot-password', redirectIfAuthed, (req, res) => {
  res.render('forgot-password', { message: null, error: null });
});

router.post('/forgot-password', redirectIfAuthed, async (req, res, next) => {
  try {
    const { email } = req.body;
    const genericMessage =
      'If an account with that email exists, a password reset link has been sent to it.';

    const user = email ? await userModel.findByEmail(email.trim()) : null;
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await userModel.setResetToken(user.id, token, expiry);

      const resetUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
      await sendMail({
        to: user.email,
        subject: 'Reset your Invoice App password',
        text: `Reset your password using this link (valid for 15 minutes): ${resetUrl}`,
        html: `<p>Reset your password using the link below (valid for 15 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      });
    }
    // Same response whether or not the email was found — never reveal existence.
    res.render('forgot-password', { message: genericMessage, error: null });
  } catch (err) {
    next(err);
  }
});

router.get('/reset-password', redirectIfAuthed, async (req, res) => {
  const { token } = req.query;
  const user = token ? await userModel.findByResetToken(token) : null;
  if (!user) {
    return res.render('reset-password', {
      token: null,
      error: 'This reset link is invalid or has expired. Please request a new one.',
    });
  }
  res.render('reset-password', { token, error: null });
});

router.post('/reset-password', redirectIfAuthed, async (req, res) => {
  const { token, password, confirmPassword } = req.body;
  const user = token ? await userModel.findByResetToken(token) : null;
  if (!user) {
    return res.render('reset-password', {
      token: null,
      error: 'This reset link is invalid or has expired. Please request a new one.',
    });
  }
  if (!validatePassword(password)) {
    return res.render('reset-password', { token, error: passwordRequirementsMessage() });
  }
  if (password !== confirmPassword) {
    return res.render('reset-password', { token, error: 'Passwords do not match.' });
  }
  const passwordHash = await hashPassword(password);
  await userModel.resetPassword(user.id, passwordHash);
  res.redirect('/login');
});

module.exports = router;
