const ApiRequest = require('../models/ApiRequest');
const Sample = require('../models/Sample');
const asyncHandler = require('../utils/asyncHandler');
const { findProject, findRequest, assertFolderInProject } = require('../utils/ownership');

// Only these fields can be changed from the client
const EDITABLE_FIELDS = ['name', 'method', 'url', 'description', 'params', 'headers', 'body', 'auth', 'folder'];

// POST /api/requests  { projectId, folderId?, name }
const createRequest = asyncHandler(async (req, res) => {
  const { projectId, folderId = null, name = 'New request' } = req.body;

  const project = await findProject(projectId, req.userId, req.userRole, 'editor');
  await assertFolderInProject(folderId, project._id);

  const request = await ApiRequest.create({ project: project._id, folder: folderId || null, name });
  res.status(201).json(request);
});

// GET /api/requests/:id
const getRequest = asyncHandler(async (req, res) => {
  const request = await findRequest(req.params.id, req.userId, req.userRole);
  res.json(request);
});

// PUT /api/requests/:id  { name, method, url, params, headers, body, auth, folder }
const updateRequest = asyncHandler(async (req, res) => {
  const request = await findRequest(req.params.id, req.userId, req.userRole, 'editor');

  // Moving to another folder? Make sure that folder is in the same project.
  if (req.body.folder !== undefined) {
    await assertFolderInProject(req.body.folder, request.project);
  }

  EDITABLE_FIELDS.forEach((field) => {
    if (req.body[field] !== undefined) request[field] = req.body[field];
  });

  await request.save(); // runs schema validation (e.g. method must be GET/POST/...)
  res.json(request);
});

// DELETE /api/requests/:id
const deleteRequest = asyncHandler(async (req, res) => {
  const request = await findRequest(req.params.id, req.userId, req.userRole, 'editor');
  await Sample.deleteMany({ request: request._id });
  await request.deleteOne();
  res.status(204).end();
});

module.exports = { createRequest, getRequest, updateRequest, deleteRequest };
