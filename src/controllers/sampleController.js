const Sample = require('../models/Sample');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { findRequest } = require('../utils/ownership');

// GET /api/requests/:id/samples
const listSamples = asyncHandler(async (req, res) => {
  const request = await findRequest(req.params.id, req.userId, req.userRole);
  const samples = await Sample.find({ request: request._id }).sort({ createdAt: -1 });
  res.json(samples);
});

// POST /api/requests/:id/samples  { name, status, statusText, headers, body, timeMs, sizeBytes }
const createSample = asyncHandler(async (req, res) => {
  const request = await findRequest(req.params.id, req.userId, req.userRole, 'editor');
  const { name, status, statusText, headers, body, timeMs, sizeBytes } = req.body;

  const sample = await Sample.create({
    request: request._id,
    name: name || `${status} example`,
    status,
    statusText,
    headers,
    body,
    timeMs,
    sizeBytes,
  });
  res.status(201).json(sample);
});

// DELETE /api/requests/:id/samples/:sampleId
const deleteSample = asyncHandler(async (req, res) => {
  const request = await findRequest(req.params.id, req.userId, req.userRole, 'editor');
  const deleted = await Sample.findOneAndDelete({ _id: req.params.sampleId, request: request._id });
  if (!deleted) throw new AppError(404, 'Sample not found');
  res.status(204).end();
});

module.exports = { listSamples, createSample, deleteSample };
