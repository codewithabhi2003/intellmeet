const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const { setAuthCookie } = require('../utils/generateToken');

exports.registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(128),
});
exports.loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, avatarUrl: u.avatarUrl, role: u.role, languagePreferences: u.languagePreferences });

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email: email.toLowerCase() }))
    return res.status(409).json({ success: false, code: 'DUPLICATE', message: 'That email is already registered.' });
  const user = await User.create({ name, email, password });
  // every user starts with a personal workspace so they can create meetings immediately
  await Workspace.create({ name: `${name}'s workspace`, ownerId: user._id, members: [{ userId: user._id, role: 'owner' }] });
  const token = setAuthCookie(res, user._id);
  res.status(201).json({ success: true, token, user: publicUser(user) });
});

exports.login = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() }).select('+password');
  if (!user || !user.isActive || !(await user.matchPassword(req.body.password)))
    return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Invalid email or password.' });
  const token = setAuthCookie(res, user._id);
  res.json({ success: true, token, user: publicUser(user) });
});

exports.logout = (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
};

exports.me = (req, res) => res.json({ success: true, user: publicUser(req.user) });
