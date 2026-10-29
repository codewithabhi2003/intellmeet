const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
exports.protect = asyncHandler(async (req, res, next) => {
  const h = req.headers.authorization;
  const token = req.cookies?.token || (h && h.startsWith('Bearer ') ? h.slice(7) : null);
  if (!token) return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated.' });
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Session expired.' }); }
  const user = await User.findById(payload.id);
  if (!user || !user.isActive) return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Not authenticated.' });
  req.user = user;
  next();
});
