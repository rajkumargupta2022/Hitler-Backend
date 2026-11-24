const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const createToken = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const publicUser = (user) => ({ id: user._id, name: user.name, email: user.email, role: user.role, approved: user.approved });

// Emails listed in ADMIN_EMAIL (comma separated) are admins; checked at register and login so an existing account can be promoted
const isAdminEmail = (email) =>
  (process.env.ADMIN_EMAIL || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(String(email).toLowerCase());

async function promoteIfAdmin(user) {
  if (user.role !== 'admin' && isAdminEmail(user.email)) {
    user.role = 'admin';
    user.approved = true;
    await user.save();
  }
}

// POST /api/auth/register  { name, email, password }
// Everyone registers as a normal user who can create projects; access to other people's projects
// (viewer / editor) is granted per project by that project's owner.
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) throw new AppError(400, 'Name, email and password are required');
  if (password.length < 6) throw new AppError(400, 'Password must be at least 6 characters');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, role: 'editor', approved: true });
  await promoteIfAdmin(user);

  res.status(201).json({ token: createToken(user), user: publicUser(user) });
});

// POST /api/auth/login  { email, password }
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || '').toLowerCase() });

  const isMatch = user && (await bcrypt.compare(password || '', user.passwordHash));
  if (!isMatch) throw new AppError(401, 'Email or password is incorrect');
  await promoteIfAdmin(user);

  res.json({ token: createToken(user), user: publicUser(user) });
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw new AppError(401, 'Account not found');
  res.json(publicUser(user));
});

module.exports = { register, login, me };
