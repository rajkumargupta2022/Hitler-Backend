const User = require('../models/User');
const Project = require('../models/Project');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/admin/users  -> every user plus the ids of the projects each viewer may read
const listUsers = asyncHandler(async (req, res) => {
  const [users, projects] = await Promise.all([
    User.find().select('name email role approved createdAt').sort({ approved: 1, createdAt: -1 }).lean(),
    Project.find().select('name owner viewers').sort({ name: 1 }).lean(),
  ]);

  const grants = new Map(); // userId -> [projectId]
  projects.forEach((p) => (p.viewers || []).forEach((v) => grants.set(String(v), [...(grants.get(String(v)) || []), p._id])));

  res.json({
    users: users.map((u) => ({ ...u, role: u.role || 'editor', approved: u.approved !== false, projectIds: grants.get(String(u._id)) || [] })),
    projects: projects.map((p) => ({ _id: p._id, name: p.name, owner: p.owner })),
  });
});

// PUT /api/admin/users/:id  { approved?, projectIds? }  (only viewers need either)
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError(404, 'User not found');
  if (user.role !== 'viewer') throw new AppError(400, 'Only viewer accounts are approved or given project access');

  if (req.body.approved !== undefined) {
    user.approved = Boolean(req.body.approved);
    await user.save();
  }

  if (req.body.projectIds !== undefined) {
    if (!Array.isArray(req.body.projectIds)) throw new AppError(400, 'projectIds must be a list');
    const ids = await Project.find({ _id: { $in: req.body.projectIds } }).distinct('_id');
    await Project.updateMany({ _id: { $nin: ids } }, { $pull: { viewers: user._id } });
    await Project.updateMany({ _id: { $in: ids } }, { $addToSet: { viewers: user._id } });
  }

  res.json({ ok: true });
});

module.exports = { listUsers, updateUser };
