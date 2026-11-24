const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const { executeRequest } = require('../controllers/executeController');

router.post('/', requireAuth, executeRequest);

module.exports = router;
