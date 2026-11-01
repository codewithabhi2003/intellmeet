const asyncHandler = require('express-async-handler');
const Workspace = require('../models/Workspace');
exports.requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next()
    : res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You do not have permission.' });

// Loads the workspace for :workspaceId / :id and checks membership (and optional workspace roles).
exports.workspaceMember = (...wsRoles) => asyncHandler(async (req, res, next) => {
  const ws = await Workspace.findById(req.params.workspaceId || req.params.id);
  const m = ws?.members.find((x) => x.userId.equals(req.user._id));
  if (!ws || !m || (wsRoles.length && !wsRoles.includes(m.role)))
    return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You do not have permission.' });
  req.workspace = ws; req.workspaceRole = m.role;
  next();
});
