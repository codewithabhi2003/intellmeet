const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { env } = require('../config/aiConfig');

const dir = path.resolve(process.env.STORAGE_DIR || './storage', 'recordings');
const EXT = {
  'audio/webm': '.webm', 'video/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3',
  'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav', 'audio/flac': '.flac',
};
const baseMime = (m = '') => m.split(';')[0].trim().toLowerCase();
const ALLOWED_EXT = new Set(Object.values(EXT).concat(['.mpga', '.mp4', '.oga']));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, f, cb) => { fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
    filename: (req, f, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXT[baseMime(f.mimetype)]), // never the client's name
  }),
  // floor: busboy enforces the cap with ===, so a fractional byte limit (e.g. MAX_UPLOAD_MB=0.3) would silently disable it
  limits: { fileSize: Math.floor(env.MAX_UPLOAD_MB * 1024 * 1024), files: 1 },
  fileFilter: (req, f, cb) => {
    const ok = EXT[baseMime(f.mimetype)] && ALLOWED_EXT.has(path.extname(f.originalname || '').toLowerCase() || EXT[baseMime(f.mimetype)]);
    cb(ok ? null : Object.assign(new Error('bad type'), { unsupported: true }), !!ok);
  },
}).single('audio');

module.exports = (req, res, next) => upload(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, code: 'AUDIO_TOO_LARGE', message: 'The audio file is too large.' });
  if (err.unsupported) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Unsupported audio format.' });
  next(err);
});
