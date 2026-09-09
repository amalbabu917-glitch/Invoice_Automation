const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'signatures');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg']);
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB, per spec

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, name);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error('Signature must be a PNG, JPG, or JPEG image.'));
  }
  cb(null, true);
}

const signatureUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
});

// Public URL path (served by express.static) for a stored signature filename.
function signatureUrl(filename) {
  if (!filename) return null;
  return `/uploads/signatures/${filename}`;
}

function deleteSignatureFile(filename) {
  if (!filename) return;
  const p = path.join(UPLOAD_DIR, filename);
  fs.unlink(p, () => {}); // best-effort, ignore errors (e.g. already gone)
}

module.exports = { signatureUpload, signatureUrl, deleteSignatureFile, MAX_SIZE_BYTES };
