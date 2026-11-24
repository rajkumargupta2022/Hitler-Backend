const Project = require('../models/Project');
const Folder = require('../models/Folder');
const ApiRequest = require('../models/ApiRequest');
const Sample = require('../models/Sample');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const User = require('../models/User');
const { convert } = require('../services/importService');
const { accessOf, findProject, projectFilter, assertFolderInProject } = require('../utils/ownership');

const withAccess = (project, userId, userRole) => ({ ...project.toObject(), access: accessOf(project, userId, userRole) });

const EXPORT_FORMAT = 'api-tester-project';

// GET /api/projects
const listProjects = asyncHandler(async (req, res) => {
  const projects = await Project.find(projectFilter(req.userId, req.userRole)).sort({ updatedAt: -1 });
  res.json(projects.map((p) => withAccess(p, req.userId, req.userRole)));
});

// POST /api/projects  { name, description }
const createProject = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const project = await Project.create({ owner: req.userId, name, description });
  res.status(201).json(project);
});

// Cleans the variables list sent by the client; rejects bad or duplicate names
function cleanVariables(list) {
  if (!Array.isArray(list)) throw new AppError(400, 'variables must be a list');
  const seen = new Set();
  return list
    .map((v) => ({ key: String(v.key || '').trim(), value: String(v.value ?? ''), enabled: v.enabled !== false }))
    .filter((v) => v.key)
    .map((v) => {
      if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(v.key)) {
        throw new AppError(400, `"${v.key}" is not a valid variable name. Use letters, numbers, _ . - and start with a letter.`);
      }
      if (seen.has(v.key)) throw new AppError(400, `Variable "${v.key}" is defined twice`);
      seen.add(v.key);
      return v;
    });
}

// PUT /api/projects/:id  { name, description, variables }
const updateProject = asyncHandler(async (req, res) => {
  const project = await findProject(req.params.id, req.userId, req.userRole, 'editor');
  if (req.body.name !== undefined) project.name = req.body.name;
  if (req.body.description !== undefined) project.description = req.body.description;
  if (req.body.variables !== undefined) project.variables = cleanVariables(req.body.variables);
  if (req.body.auth !== undefined) {
    const a = req.body.auth || {};
    if (!['none', 'bearer', 'basic'].includes(a.type)) throw new AppError(400, 'Default auth must be none, bearer or basic');
    project.auth = { type: a.type, token: String(a.token ?? ''), username: String(a.username ?? ''), password: String(a.password ?? '') };
  }
  await project.save();
  res.json(project);
});

// DELETE /api/projects/:id  (also deletes its folders, requests and samples)
const deleteProject = asyncHandler(async (req, res) => {
  const project = await findProject(req.params.id, req.userId, req.userRole, 'owner');

  const requestIds = await ApiRequest.find({ project: project._id }).distinct('_id');
  await Sample.deleteMany({ request: { $in: requestIds } });
  await ApiRequest.deleteMany({ project: project._id });
  await Folder.deleteMany({ project: project._id });
  await project.deleteOne();

  res.status(204).end();
});

// GET /api/projects/:id/tree
// Returns flat lists; the frontend turns them into a nested tree (utils/buildTree.js)
const getProjectTree = asyncHandler(async (req, res) => {
  const project = await findProject(req.params.id, req.userId, req.userRole);

  const [folders, requests] = await Promise.all([
    Folder.find({ project: project._id }).select('name parent order').lean(),
    ApiRequest.find({ project: project._id }).select('name method folder order').lean(),
  ]);

  res.json({ project: withAccess(project, req.userId, req.userRole), folders, requests });
});

// PUT /api/projects/:id/move  { type, id, parentId, orderedIds: [{ type, id }, ...] }
// Moves one folder/request under parentId (null = root) and stores the final order of
// ALL siblings in that parent, so the order the user sees is the order that is saved.
const moveNode = asyncHandler(async (req, res) => {
  const project = await findProject(req.params.id, req.userId, req.userRole, 'editor');
  const { type, id, parentId = null, orderedIds } = req.body;

  if (!['folder', 'request'].includes(type) || !Array.isArray(orderedIds)) {
    throw new AppError(400, 'type and orderedIds are required');
  }
  await assertFolderInProject(parentId, project._id);

  const item = await (type === 'folder' ? Folder : ApiRequest).findOne({ _id: id, project: project._id });
  if (!item) throw new AppError(404, `${type} not found in this project`);

  // A folder can't go inside itself or one of its own sub-folders
  if (type === 'folder') {
    let current = parentId;
    while (current) {
      if (String(current) === String(item._id)) throw new AppError(400, 'A folder cannot be moved into itself');
      const folder = await Folder.findById(current).select('parent');
      current = folder ? folder.parent : null;
    }
    item.parent = parentId || null;
  } else {
    item.folder = parentId || null;
  }
  await item.save();

  const ops = { folder: [], request: [] };
  orderedIds.forEach((entry, index) => {
    if (!ops[entry.type]) return;
    ops[entry.type].push({ updateOne: { filter: { _id: entry.id, project: project._id }, update: { $set: { order: index } } } });
  });
  await Promise.all([
    ops.folder.length ? Folder.bulkWrite(ops.folder) : null,
    ops.request.length ? ApiRequest.bulkWrite(ops.request) : null,
  ]);

  res.status(204).end();
});

// GET /api/projects/:id/export
// Nested JSON of the whole project (folders, requests, samples) that import can read back.
const exportProject = asyncHandler(async (req, res) => {
  const project = await findProject(req.params.id, req.userId, req.userRole);

  const [folders, requests] = await Promise.all([
    Folder.find({ project: project._id }).lean(),
    ApiRequest.find({ project: project._id }).lean(),
  ]);
  const samples = await Sample.find({ request: { $in: requests.map((r) => r._id) } }).lean();

  const samplesByRequest = new Map();
  samples.forEach((s) => {
    const key = String(s.request);
    if (!samplesByRequest.has(key)) samplesByRequest.set(key, []);
    samplesByRequest.get(key).push({
      name: s.name, status: s.status, statusText: s.statusText, headers: s.headers,
      body: s.body, timeMs: s.timeMs, sizeBytes: s.sizeBytes,
    });
  });

  const keyValues = (list) => (list || []).map(({ key, value, enabled }) => ({ key, value, enabled }));

  // Folders and requests share one "order" sequence per parent, so sort them together
  function childrenOf(parentId) {
    const sameParent = (id) => String(id || '') === String(parentId || '');
    const items = [
      ...folders.filter((f) => sameParent(f.parent)).map((f) => ({ order: f.order, node: f, type: 'folder' })),
      ...requests.filter((r) => sameParent(r.folder)).map((r) => ({ order: r.order, node: r, type: 'request' })),
    ].sort((a, b) => a.order - b.order);

    return items.map(({ node, type }) =>
      type === 'folder'
        ? { type, name: node.name, items: childrenOf(node._id) }
        : {
            type, name: node.name, method: node.method, url: node.url, description: node.description,
            params: keyValues(node.params), headers: keyValues(node.headers),
            body: {
              type: node.body?.type, content: node.body?.content,
              fields: (node.body?.fields || []).map(({ key, type, value, enabled }) => ({ key, type, value, enabled })), // files are not stored, only their names
            },
            auth: node.auth ? { type: node.auth.type, token: node.auth.token, username: node.auth.username, password: node.auth.password } : undefined,
            samples: samplesByRequest.get(String(node._id)) || [],
          }
    );
  }

  res.json({
    format: EXPORT_FORMAT,
    version: 1,
    name: project.name,
    description: project.description,
    variables: project.variables.map(({ key, value, enabled }) => ({ key, value, enabled })),
    auth: project.auth ? { type: project.auth.type, token: project.auth.token, username: project.auth.username, password: project.auth.password } : undefined,
    items: childrenOf(null),
  });
});

// POST /api/projects/import  { data }  (data = parsed JSON from Postman, Hoppscotch, Insomnia or this app's export)
// Creates a NEW project owned by the caller; nothing existing is touched.
const MAX_IMPORT_NODES = 5000;
const importProject = asyncHandler(async (req, res) => {
  const { data } = req.body;
  if (data === undefined || data === null || typeof data !== 'object') throw new AppError(400, 'Send the parsed file as { data }');

  const parsed = convert(data);
  let total = 0;
  const count = (items) => items.forEach((n) => { total += 1; if (n.type === 'folder') count(n.items); });
  count(parsed.items);
  if (total > MAX_IMPORT_NODES) throw new AppError(400, `Too many items (${total}). The limit is ${MAX_IMPORT_NODES}.`);

  const project = await Project.create({ owner: req.userId, name: parsed.name, description: parsed.description, variables: parsed.variables, auth: parsed.auth });
  let requestCount = 0;

  // Folders and requests share one "order" sequence per parent, so number them together
  async function createLevel(items, parentId) {
    const requestDocs = [];
    const sampleSource = [];
    for (let i = 0; i < items.length; i += 1) {
      const node = items[i];
      if (node.type === 'folder') {
        const folder = await Folder.create({ project: project._id, parent: parentId, name: node.name, order: i });
        await createLevel(node.items, folder._id);
      } else {
        const { samples, type, ...fields } = node;
        requestDocs.push({ ...fields, project: project._id, folder: parentId, order: i });
        sampleSource.push(samples);
      }
    }
    if (!requestDocs.length) return;
    const created = await ApiRequest.insertMany(requestDocs);
    requestCount += created.length;
    const sampleDocs = created.flatMap((doc, idx) => sampleSource[idx].map((smp) => ({ ...smp, request: doc._id })));
    if (sampleDocs.length) await Sample.insertMany(sampleDocs);
  }

  try {
    await createLevel(parsed.items, null);
  } catch (err) {
    // Don't leave a half-imported project behind
    const requestIds = await ApiRequest.find({ project: project._id }).distinct('_id');
    await Sample.deleteMany({ request: { $in: requestIds } });
    await ApiRequest.deleteMany({ project: project._id });
    await Folder.deleteMany({ project: project._id });
    await project.deleteOne();
    throw err.name === 'ValidationError' ? new AppError(400, `Could not import: ${err.message}`) : err;
  }

  res.status(201).json({ project: withAccess(project, req.userId, req.userRole), source: parsed.kind, requests: requestCount });
});

// ---- Members: the owner adds other registered users by email ----
const MEMBER_ROLES = ['viewer', 'editor'];
const listOf = (role) => (role === 'editor' ? 'editors' : 'viewers');

async function membersPayload(project) {
  const [owner, editors, viewers] = await Promise.all([
    User.findById(project.owner).select('name email').lean(),
    User.find({ _id: { $in: project.editors } }).select('name email').lean(),
    User.find({ _id: { $in: project.viewers } }).select('name email').lean(),
  ]);
  const shape = (u, role) => ({ id: u._id, name: u.name, email: u.email, role });
  return {
    owner: owner && shape(owner, 'owner'),
    members: [...editors.map((u) => shape(u, 'editor')), ...viewers.map((u) => shape(u, 'viewer'))],
  };
}

function setMemberRole(project, userId, role) {
  project.editors.pull(userId);
  project.viewers.pull(userId);
  project[listOf(role)].push(userId);
}

// GET /api/projects/:id/members
const getMembers = asyncHandler(async (req, res) => {
  const project = await findProject(req.params.id, req.userId, req.userRole, 'owner');
  res.json(await membersPayload(project));
});

// POST /api/projects/:id/members  { email, role: 'viewer' | 'editor' }  (changes the role if already a member)
const addMember = asyncHandler(async (req, res) => {
  const project = await findProject(req.params.id, req.userId, req.userRole, 'owner');
  const role = req.body.role || 'viewer';
  if (!MEMBER_ROLES.includes(role)) throw new AppError(400, 'Role must be viewer or editor');

  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) throw new AppError(400, 'Email is required');
  const user = await User.findOne({ email });
  if (!user) throw new AppError(404, 'No account with that email. Ask them to register first.');
  if (String(user._id) === String(project.owner)) throw new AppError(400, 'You already own this project');

  setMemberRole(project, user._id, role);
  await project.save();
  res.status(201).json(await membersPayload(project));
});

// PUT /api/projects/:id/members/:userId  { role }
const updateMember = asyncHandler(async (req, res) => {
  const project = await findProject(req.params.id, req.userId, req.userRole, 'owner');
  const { role } = req.body;
  if (!MEMBER_ROLES.includes(role)) throw new AppError(400, 'Role must be viewer or editor');
  const { userId } = req.params;
  if (![...project.editors, ...project.viewers].some((id) => String(id) === userId)) throw new AppError(404, 'Member not found');

  setMemberRole(project, userId, role);
  await project.save();
  res.json(await membersPayload(project));
});

// DELETE /api/projects/:id/members/:userId
const removeMember = asyncHandler(async (req, res) => {
  const project = await findProject(req.params.id, req.userId, req.userRole, 'owner');
  project.editors.pull(req.params.userId);
  project.viewers.pull(req.params.userId);
  await project.save();
  res.json(await membersPayload(project));
});

module.exports = { importProject, getMembers, addMember, updateMember, removeMember, exportProject, listProjects, createProject, updateProject, deleteProject, getProjectTree, moveNode };
