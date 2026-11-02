const asyncHandler = require('express-async-handler');
const { userFromToken } = require('../utils/session');
exports.protect = asyncHandler(async (req, res, next) => {
  const h = req.headers.authorization;
  const token = req.cookies?.token || (h && h.startsWith('Bearer ') ? h.slice(7) : null);
  if (!token) return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated.' });
  const user = await userFromToken(token);                        // also rejects tokens revoked by "log out of all devices" / a password change
  if (!user) return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Session expired. Please sign in again.' });
  req.user = user;
  next();
});