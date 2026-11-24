// Helpers that load a document AND check the logged-in user may use it.
// Access levels on a project: 'owner' (the creator) > 'editor' (added by the owner) > 'viewer' (read-only).
// Admins can read every project but only change their own.
const Project = require('../models/Project');
const Folder = require('../models/Folder');
const ApiRequest = require('../models/ApiRequest');
const AppError = require('./AppError');

const RANK = { viewer: 1, editor: 2, owner: 3 };
const has = (list, id) => (list || []).some((x) => String(x) === String(id));

// What can this user do on this project? Returns 'owner' | 'editor' | 'viewer' | null
function accessOf(project, userId, userRole) {
  if (String(project.owner) === String(userId)) return 'owner';
  if (has(project.editors, userId)) return 'editor';
  if (has(project.viewers, userId) || userRole === 'admin') return 'viewer';
  return null;
}

// Mongo filter for "every project this user can at least read"
function projectFilter(userId, role) {
  if (role === 'admin') return {};
  return { $or: [{ owner: userId }, { editors: userId }, { viewers: userId }] };
}

// need: 'viewer' (read), 'editor' (change content), 'owner' (members, delete)
async function findProject(projectId, userId, userRole, need = 'viewer') {
  const project = await Project.findById(projectId);
  const access = project && accessOf(project, userId, userRole);
  if (!access) throw new AppError(404, 'Project not found');
  if (RANK[access] < RANK[need]) {
    throw new AppError(403, need === 'owner' ? 'Only the project owner can do this' : 'You have read-only access to this project');
  }
  return project;
}

async function findFolder(folderId, userId, userRole, need = 'editor') {
  const folder = await Folder.findById(folderId);
  if (!folder) throw new AppError(404, 'Folder not found');
  await findProject(folder.project, userId, userRole, need);
  return folder;
}

async function findRequest(requestId, userId, userRole, need = 'viewer') {
  const request = await ApiRequest.findById(requestId);
  if (!request) throw new AppError(404, 'Request not found');
  await findProject(request.project, userId, userRole, need);
  return request;
}

// Checks that a folder exists inside the given project (used when creating/moving)
async function assertFolderInProject(folderId, projectId) {
  if (!folderId) return; // null = project root, always allowed
  const folder = await Folder.findOne({ _id: folderId, project: projectId });
  if (!folder) throw new AppError(404, 'Folder not found in this project');
}

module.exports = { accessOf, projectFilter, findProject, findFolder, findRequest, assertFolderInProject };
