const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/userController');
const validate = require('../middleware/validate');
const uploadAvatar = require('../middleware/uploadAvatar');
const { protect } = require('../middleware/authMiddleware');

const avatarLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id || 'anon'),
  message: { success: false, code: 'RATE_LIMITED', message: 'Too many uploads. Please wait a moment.' } });

router.use(protect);
router.get('/me', c.getMe);
router.put('/me', validate({ body: c.updateSchema }), c.updateMe);
router.post('/me/avatar', avatarLimiter, uploadAvatar, c.uploadAvatar);
router.delete('/me/avatar', c.removeAvatar);
router.get('/me/language-preferences', c.getLang);
router.put('/me/language-preferences', validate({ body: c.langPrefSchema }), c.putLang);
router.get('/:id/avatar', validate({ params: c.idParam }), c.getAvatar);
module.exports = router;
