const bcrypt = require('bcryptjs');

// Per the client spec: login password must be 5-6 characters and contain
// at least one uppercase letter, one lowercase letter, one digit, and one
// special character.
//
// NOTE: this is a deliberately short max length (6 chars) combined with a
// 4-character-class requirement, which is unusually weak for a password
// policy (little room left for actual entropy). It's implemented exactly
// as specified because it was explicit in the client's document, not
// because it's recommended - flagged here and in SETUP.md so whoever owns
// this later can decide whether to relax it.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{5,6}$/;

function validatePassword(password) {
  if (typeof password !== 'string') return false;
  return PASSWORD_REGEX.test(password);
}

function passwordRequirementsMessage() {
  return 'Password must be 5–6 characters and include at least one uppercase letter, one lowercase letter, one number, and one special character.';
}

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  validatePassword,
  passwordRequirementsMessage,
  hashPassword,
  comparePassword,
};
