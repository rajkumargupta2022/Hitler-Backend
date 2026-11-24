// Reads "Authorization: Bearer <token>", verifies it, and loads the user so a role or approval
// change by an admin takes effect immediately. Sets req.userId and req.userRole.
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');

// allowPending = true lets an unapproved viewer through (only /auth/me uses it, so the client can show "waiting for approval")
function makeAuth(allowPending) {
  return async function auth(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return next(new AppError(401, 'Please log in to continue'));
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return next(new AppError(401, 'Your session has expired. Please log in again.'));
    }

    try {
      const user = await User.findById(payload.id).select('role approved');
      if (!user) return next(new AppError(401, 'Account not found'));
      if (!allowPending && !user.approved) return next(new AppError(403, 'Your account is waiting for admin approval'));
      req.userId = user._id;
      req.userRole = user.role === 'admin' ? 'admin' : 'editor'; // legacy global "viewer" accounts are treated as normal users
      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin') return next(new AppError(403, 'Admins only'));
  next();
}

const requireAuth = makeAuth(false);
module.exports = requireAuth;
module.exports.allowPending = makeAuth(true);
module.exports.requireAdmin = requireAdmin;
