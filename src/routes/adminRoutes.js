const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const c = require('../controllers/adminController');

router.use(requireAuth, requireAuth.requireAdmin);

router.get('/users', c.listUsers);
router.put('/users/:id', c.updateUser);

module.exports = router;
