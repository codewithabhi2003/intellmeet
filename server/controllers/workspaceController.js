const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const Workspace = require('../models/Workspace');
const User = require('../models/User');

exports.createSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
exports.addMemberSchema = z.object({ email: z.string().trim().email(), role: z.enum(['admin', 'member']).default('member') }).strict();

const view = (w) => ({ id: w._id, name: w.name, ownerId: w.ownerId, members: w.members, createdAt: w.createdAt });

exports.create = asyncHandler(async (req, res) => {
  const w = await Workspace.create({ name: req.body.name, ownerId: req.user._id, members: [{ userId: req.user._id, role: 'owner' }] });
  res.status(201).json({ success: true, workspace: view(w) });
});
exports.list = asyncHandler(async (req, res) => {
  const ws = await Workspace.find({ 'members.userId': req.user._id }).sort({ createdAt: 1 }).populate('members.userId', 'name email avatarUrl');
  res.json({ success: true, workspaces: ws.map(view) });
});
exports.addMember = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase(), isActive: true });
  if (!user) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No user with that email.' });
  const ws = req.workspace;
  if (ws.members.some((m) => m.userId.equals(user._id))) return res.status(409).json({ success: false, code: 'DUPLICATE', message: 'Already a member.' });
  if (req.body.role === 'admin' && req.workspaceRole !== 'owner')
    return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Only the owner can add admins.' });
  ws.members.push({ userId: user._id, role: req.body.role });
  await ws.save();
  res.status(201).json({ success: true, workspace: view(ws) });
});
exports.removeMember = asyncHandler(async (req, res) => {
  const ws = req.workspace;
  const target = ws.members.find((m) => String(m.userId) === req.params.userId);
  if (!target) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Member not found.' });
  if (target.role === 'owner') return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'The owner cannot be removed.' });
  if (target.role === 'admin' && req.workspaceRole !== 'owner')
    return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Only the owner can remove admins.' });
  ws.members = ws.members.filter((m) => String(m.userId) !== req.params.userId);
  await ws.save();
  res.json({ success: true, workspace: view(ws) });
});
