const multer = require('multer');
const { env } = require('../config/aiConfig');

const OK_TYPE = /^image\/(png|jpeg|webp)$/;
// Memory storage: the file is only written to disk after its real bytes pass the signature check in the controller.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.floor(env.MAX_AVATAR_MB * 1024 * 1024), files: 1 },   // floor: see uploadAudio.js (busboy compares with ===)
  fileFilter: (req, f, cb) => cb(OK_TYPE.test(f.mimetype) ? null : Object.assign(new Error('bad type'), { unsupported: true }), OK_TYPE.test(f.mimetype)),
}).single('avatar');

module.exports = (req, res, next) => upload(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, code: 'FILE_TOO_LARGE', message: `The image must be ${env.MAX_AVATAR_MB} MB or smaller.` });
  if (err.unsupported || err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Use a PNG, JPEG or WebP image.' });
  next(err);
});
