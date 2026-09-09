const nodemailer = require('nodemailer');

function getTransport() {
  if (!process.env.SMTP_HOST) {
    return null; // dev fallback: log instead of sending, see sendMail()
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

async function sendMail({ to, subject, html, text }) {
  const transport = getTransport();
  if (!transport) {
    // No SMTP configured (e.g. local dev without .env SMTP_* set): log the
    // email instead of failing, so the reset-password flow is still testable.
    console.log('--- SMTP not configured; would have sent email ---');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log(text || html);
    console.log('---------------------------------------------------');
    return { simulated: true };
  }
  return transport.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@example.com',
    to,
    subject,
    html,
    text,
  });
}

module.exports = { sendMail };
