const router = require('express').Router();
const c = require('../controllers/meetingSearchController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/authMiddleware');
const aiRateLimiter = require('../middleware/aiRateLimiter');
// No feature-flag 503 here on purpose: without GEMINI_API_KEY the service still returns labeled keyword-only excerpts.
router.post('/query', protect, validate({ body: c.querySchema }), aiRateLimiter, c.query);
router.get('/suggestions', protect, c.suggestions);
module.exports = router;
