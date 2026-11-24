const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const requests = require('../controllers/requestController');
const samples = require('../controllers/sampleController');

router.use(requireAuth); // edit rights are checked per project in the controllers

// Saved requests
router.post('/', requests.createRequest);
router.get('/:id', requests.getRequest);
router.put('/:id', requests.updateRequest);
router.delete('/:id', requests.deleteRequest);

// Saved response samples for a request
router.get('/:id/samples', samples.listSamples);
router.post('/:id/samples', samples.createSample);
router.delete('/:id/samples/:sampleId', samples.deleteSample);

module.exports = router;
