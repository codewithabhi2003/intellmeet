
const router = require('express').Router();
const rateLimit = require('express-rate-limit');

const c = require('../controllers/userController');
const validate = require('../middleware/validate');
const uploadAvatar = require('../middleware/uploadAvatar');
const { protect } = require('../middleware/authMiddleware');

const avatarLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id || 'anon'),
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many uploads. Please wait a moment.',
  },
});

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id || 'anon'),
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many attempts. Please wait and try again.',
  },
});

// All routes require authentication.
router.use(protect);

router.get('/me', c.getMe);

router.put(
  '/me',
  validate({ body: c.updateSchema }),
  c.updateMe
);

// Avatar upload and removal
router.post(
  '/me/avatar',
  avatarLimiter,
  uploadAvatar,
  c.uploadAvatar
);

router.delete('/me/avatar', c.removeAvatar);

// Password management
router.put(
  '/me/password',
  sensitiveLimiter,
  validate({ body: c.passwordSchema }),
  c.changePassword
);

// Security events
router.get('/me/security-events', c.securityEvents);

// Language preferences
router.get('/me/language-preferences', c.getLang);

router.put(
  '/me/language-preferences',
  validate({ body: c.langPrefSchema }),
  c.putLang
);

// View another user's avatar
router.get(
  '/:id/avatar',
  validate({ params: c.idParam }),
  c.getAvatar
);

module.exports = router;
