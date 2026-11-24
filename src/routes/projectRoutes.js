const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const c = require('../controllers/projectController');

router.use(requireAuth); // every route below needs a logged-in user
// Who may do what (owner / editor / viewer) is decided per project inside the controllers

router.get('/', c.listProjects);
router.post('/', c.createProject);
router.post('/import', c.importProject); // must stay above the /:id routes
router.get('/:id/export', c.exportProject);
router.get('/:id/tree', c.getProjectTree);
router.put('/:id/move', c.moveNode);
router.get('/:id/members', c.getMembers);
router.post('/:id/members', c.addMember);
router.put('/:id/members/:userId', c.updateMember);
router.delete('/:id/members/:userId', c.removeMember);
router.put('/:id', c.updateProject);
router.delete('/:id', c.deleteProject);

module.exports = router;
