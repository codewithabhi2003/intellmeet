const router = require('express').Router();
const c = require('../controllers/aiController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/authMiddleware');
const meetingAccess = require('../middleware/meetingAccess');
const aiRateLimiter = require('../middleware/aiRateLimiter');
const { requireFeature } = require('../config/aiConfig');
// order: auth -> validation -> meeting access -> feature flag -> 💸 rate limit
router.post('/:id/transcription', protect, validate({ body: c.startSchema }), meetingAccess, requireFeature('transcription'), aiRateLimiter, c.startTranscription);
router.post('/:id/transcription/retry', protect, validate({ body: c.startSchema }), meetingAccess, requireFeature('transcription'), aiRateLimiter, c.retryTranscription);
router.get('/:id/transcript/status', protect, meetingAccess, c.transcriptStatus);
router.get('/:id/transcript', protect, validate({ query: c.pageSchema }), meetingAccess, c.getTranscript);
module.exports = router;
