
const multer = require('multer');
const { env } = require('../config/aiConfig');

const OK_TYPE = /^image\/(png|jpeg|webp)$/;

const upload = multer({
  // Temporary in-memory storage; no local files or directories.
  storage: multer.memoryStorage(),

  // Enforce file size and single-file limits.
  limits: {
    fileSize: Math.floor(env.MAX_AVATAR_MB * 1024 * 1024),
    files: 1,
  },

  // Validate the declared MIME type.
  // Actual image signatures are checked in userController.js.
  fileFilter: (req, file, cb) => {
    if (OK_TYPE.test(file.mimetype)) {
      return cb(null, true);
    }

    const error = new Error('Unsupported avatar file type');
    error.unsupported = true;

    cb(error);
  },
}).single('avatar');

module.exports = (req, res, next) => {
  upload(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        code: 'FILE_TOO_LARGE',
        message: `The image must be ${env.MAX_AVATAR_MB} MB or smaller.`,
      });
    }

    if (
      err.unsupported ||
      err.code === 'LIMIT_UNEXPECTED_FILE'
    ) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Use a PNG, JPEG or WebP image.',
      });
    }

    next(err);
  });
};
