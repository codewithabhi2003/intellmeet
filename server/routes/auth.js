const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/authController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/authMiddleware');
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } });
router.post('/register', limiter, validate({ body: c.registerSchema }), c.register);
router.post('/login', limiter, validate({ body: c.loginSchema }), c.login);
router.post('/logout', c.logout);
router.get('/me', protect, c.me);
module.exports = router;
