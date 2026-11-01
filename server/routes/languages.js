const router = require('express').Router();
router.get('/', require('../controllers/aiController').languages);
module.exports = router;
