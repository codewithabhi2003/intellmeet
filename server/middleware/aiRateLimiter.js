const rateLimit = require('express-rate-limit');
const { env } = require('../config/aiConfig');
module.exports = rateLimit({
  windowMs: 60 * 1000, limit: env.AI_RATE_LIMIT_PER_MIN, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id || 'anon'),   // per user, applied after auth
  message: { success: false, code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
});
