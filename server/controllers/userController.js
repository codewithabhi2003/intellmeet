const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const User = require('../models/User');
const langs = require('../services/ai/languages');

const code = langs.codeSchema().nullable();
const oid = z.string().regex(/^[a-f\d]{24}$/i);
// strict(): unknown keys (role, avatarUrl, password ...) are rejected, so nothing can be mass-assigned
exports.updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(200).optional(),
  currentPassword: z.string().min(1).max(128).optional(),
}).strict();
exports.langPrefSchema = z.object({ transcriptLanguage: code.optional(), summaryLanguage: code.optional(), searchAnswerLanguage: code.optional() }).strict();
exports.idParam = z.object({ id: oid });

const pub = (u) => ({ id: u._id, name: u.name, email: u.email, avatarUrl: u.avatarUrl, role: u.role, languagePreferences: u.languagePreferences });
const avatarDir = () => path.resolve(process.env.STORAGE_DIR || './storage', 'avatars');
const removeFile = (name) => { if (name) fs.unlink(path.join(avatarDir(), path.basename(name)), () => {}); };

exports.getMe = (req, res) => res.json({ success: true, user: pub(req.user) });

exports.updateMe = asyncHandler(async (req, res) => {
  const { name, email, currentPassword } = req.body;
  const next = email?.toLowerCase();
  if (next && next !== req.user.email) {
    // changing the sign-in email needs proof of the current password (403, not 401: a 401 would sign the user out in the client)
    if (!currentPassword) return res.status(400).json({ success: false, code: 'PASSWORD_REQUIRED', message: 'Enter your current password to change your email.' });
    const withPw = await User.findById(req.user._id).select('+password');
    if (!(await withPw.matchPassword(currentPassword))) return res.status(403).json({ success: false, code: 'WRONG_PASSWORD', message: 'Your current password is incorrect.' });
    if (await User.exists({ email: next, _id: { $ne: req.user._id } })) return res.status(409).json({ success: false, code: 'DUPLICATE', message: 'That email is already in use.' });
    req.user.email = next;
  }
  if (name) req.user.name = name;
  await req.user.save();
  res.json({ success: true, user: pub(req.user) });
});

// Real file signature, not the client-declared type. SVG (script-capable) is never accepted.
const sniff = (b) => {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
};
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

exports.uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Choose an image to upload.' });
  const kind = sniff(req.file.buffer);
  if (!kind) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'That file is not a valid PNG, JPEG or WebP image.' });
  fs.mkdirSync(avatarDir(), { recursive: true });
  const file = `${crypto.randomBytes(16).toString('hex')}.${kind.ext}`;           // never the client's file name
  fs.writeFileSync(path.join(avatarDir(), file), req.file.buffer);
  const user = await User.findById(req.user._id).select('+avatarFile');
  removeFile(user.avatarFile);
  user.avatarFile = file;
  user.avatarUrl = `/api/users/${user._id}/avatar?v=${Date.now()}`;               // version in the URL busts the browser cache
  await user.save();
  res.json({ success: true, user: pub(user) });
});

exports.removeAvatar = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+avatarFile');
  removeFile(user.avatarFile);
  user.avatarFile = ''; user.avatarUrl = '';
  await user.save();
  res.json({ success: true, user: pub(user) });
});

// Any signed-in user may view an avatar (you see colleagues' pictures); signed-out requests never reach this.
exports.getAvatar = asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id).select('+avatarFile');
  if (!u?.avatarFile) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No profile picture.' });
  const ext = path.extname(u.avatarFile).slice(1);
  res.set({ 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'private, max-age=86400',
    'Cross-Origin-Resource-Policy': 'same-site' });   // helmet's default (same-origin) would block <img> loads from the client's port
  res.sendFile(path.join(avatarDir(), path.basename(u.avatarFile)));
});

exports.getLang = (req, res) => res.json({ success: true, languagePreferences: req.user.languagePreferences });
exports.putLang = asyncHandler(async (req, res) => {
  Object.entries(req.body).forEach(([k, v]) => { req.user.languagePreferences[k] = v; });
  await req.user.save();
  res.json({ success: true, languagePreferences: req.user.languagePreferences });
});
