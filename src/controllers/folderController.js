const Folder = require('../models/Folder');
const ApiRequest = require('../models/ApiRequest');
const Sample = require('../models/Sample');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { findProject, findFolder, assertFolderInProject } = require('../utils/ownership');

// Finds a folder's id plus the ids of every folder nested inside it (any depth)
async function collectFolderAndChildrenIds(rootId) {
  const allIds = [rootId];
  let currentLevel = [rootId];

  while (currentLevel.length > 0) {
    const children = await Folder.find({ parent: { $in: currentLevel } }).select('_id');
    currentLevel = children.map((child) => child._id);
    allIds.push(...currentLevel);
  }
  return allIds;
}

// POST /api/folders  { projectId, parentId?, name }
const createFolder = asyncHandler(async (req, res) => {
  const { projectId, parentId = null, name } = req.body;
  if (!name || !name.trim()) throw new AppError(400, 'Folder name is required');

  const project = await findProject(projectId, req.userId, req.userRole, 'editor');
  await assertFolderInProject(parentId, project._id);

  const folder = await Folder.create({ project: project._id, parent: parentId || null, name: name.trim() });
  res.status(201).json(folder);
});

// PUT /api/folders/:id  { name }
const renameFolder = asyncHandler(async (req, res) => {
  const folder = await findFolder(req.params.id, req.userId, req.userRole);
  if (!req.body.name || !req.body.name.trim()) throw new AppError(400, 'Folder name is required');

  folder.name = req.body.name.trim();
  await folder.save();
  res.json(folder);
});

// DELETE /api/folders/:id  (deletes sub-folders, their requests and samples too)
const deleteFolder = asyncHandler(async (req, res) => {
  const folder = await findFolder(req.params.id, req.userId, req.userRole);

  const folderIds = await collectFolderAndChildrenIds(folder._id);
  const requestIds = await ApiRequest.find({ folder: { $in: folderIds } }).distinct('_id');

  await Sample.deleteMany({ request: { $in: requestIds } });
  await ApiRequest.deleteMany({ _id: { $in: requestIds } });
  await Folder.deleteMany({ _id: { $in: folderIds } });

  res.status(204).end();
});

module.exports = { createFolder, renameFolder, deleteFolder };
