const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const c = require('../controllers/folderController');

router.use(requireAuth); // edit rights are checked per project in the controller

router.post('/', c.createFolder);
router.put('/:id', c.renameFolder);
router.delete('/:id', c.deleteFolder);

module.exports = router;
