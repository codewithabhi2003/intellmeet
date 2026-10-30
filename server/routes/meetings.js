const router = require('express').Router();
const c = require('../controllers/meetingController');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/authMiddleware');
const meetingAccess = require('../middleware/meetingAccess');
const aiRateLimiter = require('../middleware/aiRateLimiter');
const uploadAudio = require('../middleware/uploadAudio');

router.use(protect);
// static routes first so they are not captured by /:id
router.get('/rtc-config', c.rtcConfig);
router.post('/join', validate({ body: c.joinSchema }), c.join);
router.post('/', validate({ body: c.createSchema }), c.create);
router.get('/', validate({ query: c.listSchema }), c.list);

router.get('/:id', meetingAccess, c.get);
router.patch('/:id', meetingAccess, validate({ body: c.patchSchema }), c.patch);
router.delete('/:id', meetingAccess, c.remove);
router.post('/:id/end', meetingAccess, c.end);
router.put('/:id/language-settings', meetingAccess, validate({ body: c.langSettingsSchema }), c.setLanguageSettings);
router.get('/:id/messages', meetingAccess, validate({ query: c.messagesSchema }), c.messages);
router.post('/:id/consent', meetingAccess, c.consent);
// 💸 auth → access → rate limit → upload
router.post('/:id/recording', meetingAccess, aiRateLimiter, uploadAudio, c.uploadRecording);
// Phase 3 mounts transcription/translation/summary sub-routes here.
module.exports = router;
