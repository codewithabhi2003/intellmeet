const router = require('express').Router();
const { features } = require('../config/aiConfig');
// Feature flags only — never key values.
router.get('/status', (req, res) => res.json({ success: true, features }));
module.exports = router;
