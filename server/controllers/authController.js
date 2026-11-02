const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const { setAuthCookie, clearAuthCookie } = require('../utils/generateToken');
const security = require('../services/security');
// Compared against when the email is unknown, so "no such account" takes as long as "wrong password" (no timing leak).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

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
  const token = setAuthCookie(res, user);
  res.status(201).json({ success: true, token, user: publicUser(user) });
});

exports.login = asyncHandler(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const lock = await security.lockStatus(email);
  if (lock.locked) {                                              // refused even with the right password, and the same for unknown emails
    res.set('Retry-After', String(lock.retryAfterSec));
    return res.status(429).json({ success: false, code: 'TOO_MANY_ATTEMPTS', message: 'Too many sign-in attempts. Please try again in a few minutes.' });
  }
  const user = await User.findOne({ email }).select('+password');
  if (!user) await bcrypt.compare(req.body.password, DUMMY_HASH);
  const ok = !!user && user.isActive && (await user.matchPassword(req.body.password));
  if (!ok) {
    const r = await security.recordFailure(email);
    if (user) { await security.recordEvent(user._id, 'login_failed', req); if (r.locked) await security.recordEvent(user._id, 'account_locked', req); }
    return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Invalid email or password.' });
  }
  await security.clearFailures(email);
  const token = setAuthCookie(res, user);
  await security.recordEvent(user._id, 'login_success', req);
  res.json({ success: true, token, user: publicUser(user) });
});

exports.logout = (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
};

// Signs the account out EVERYWHERE: every token issued so far stops working (including one an attacker may have stolen),
// and every live socket is cut.
exports.logoutAll = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  await security.recordEvent(req.user._id, 'sessions_revoked', req);
  require('../sockets').revokeUserSockets(req.user._id);
  clearAuthCookie(res);
  res.json({ success: true });
});

exports.me = (req, res) => res.json({ success: true, user: publicUser(req.user) });