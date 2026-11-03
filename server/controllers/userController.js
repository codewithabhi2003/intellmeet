
const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const crypto = require('crypto');
const User = require('../models/User');
const SecurityEvent = require('../models/SecurityEvent');
const security = require('../services/security');
const { setAuthCookie } = require('../utils/generateToken');
const langs = require('../services/ai/languages');
const cloudinary = require('../config/cloudinary');

const code = langs.codeSchema().nullable();
const oid = z.string().regex(/^[a-f\d]{24}$/i);

exports.updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(200).optional(),
  currentPassword: z.string().min(1).max(128).optional(),
}).strict();

exports.passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
}).strict();

exports.langPrefSchema = z.object({
  transcriptLanguage: code.optional(),
  summaryLanguage: code.optional(),
  searchAnswerLanguage: code.optional(),
}).strict();

exports.idParam = z.object({ id: oid });

const pub = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  avatarUrl: u.avatarUrl,
  role: u.role,
  languagePreferences: u.languagePreferences,
});

exports.getMe = (req, res) =>
  res.json({ success: true, user: pub(req.user) });

exports.updateMe = asyncHandler(async (req, res) => {
  const { name, email, currentPassword } = req.body;
  const next = email?.toLowerCase();

  if (next && next !== req.user.email) {
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        code: 'PASSWORD_REQUIRED',
        message: 'Enter your current password to change your email.',
      });
    }

    const withPw = await User.findById(req.user._id).select('+password');

    if (!(await withPw.matchPassword(currentPassword))) {
      return res.status(403).json({
        success: false,
        code: 'WRONG_PASSWORD',
        message: 'Your current password is incorrect.',
      });
    }

    if (await User.exists({
      email: next,
      _id: { $ne: req.user._id },
    })) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE',
        message: 'That email is already in use.',
      });
    }

    req.user.email = next;
    await security.recordEvent(req.user._id, 'email_changed', req);
  }

  if (name) req.user.name = name;

  await req.user.save();

  res.json({ success: true, user: pub(req.user) });
});

const sniff = (buffer) => {
  if (
    buffer.length > 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return true;
  }

  if (
    buffer.length > 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return true;
  }

  if (
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return true;
  }

  return false;
};

const uploadToCloudinary = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: crypto.randomBytes(16).toString('hex'),
        overwrite: false,
        resource_type: 'image',
        allowed_formats: ['png', 'jpg', 'webp'],
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload failed:', {
            message: error.message,
            http_code: error.http_code,
          });
          return reject(error);
        }

        if (!result?.secure_url || !result?.public_id) {
          return reject(
            new Error('Cloudinary returned an incomplete upload result.')
          );
        }

        resolve(result);
      }
    );

    stream.on('error', reject);
    stream.end(buffer);
  });

const deleteCloudinaryImage = async (publicId) => {
  if (!publicId) return;

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      invalidate: true,
    });

    if (result.result !== 'ok' && result.result !== 'not found') {
      console.error('Cloudinary avatar deletion result:', result);
    }
  } catch (error) {
    console.error('Cloudinary avatar cleanup failed:', error.message);
  }
};

exports.uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Choose an image to upload.',
    });
  }

  if (!sniff(req.file.buffer)) {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'That file is not a valid PNG, JPEG or WebP image.',
    });
  }

  const user = await User.findById(req.user._id)
    .select('+avatarPublicId');

  if (!user) {
    return res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: 'User not found.',
    });
  }

  const result = await uploadToCloudinary(
    req.file.buffer,
    'intellmeet/avatars'
  );

  const previousPublicId = user.avatarPublicId;

  try {
    user.avatarUrl = result.secure_url;
    user.avatarPublicId = result.public_id;
    await user.save();
  } catch (error) {
    await deleteCloudinaryImage(result.public_id);
    throw error;
  }

  if (previousPublicId && previousPublicId !== result.public_id) {
    await deleteCloudinaryImage(previousPublicId);
  }

  res.json({
    success: true,
    user: pub(user),
  });
});

exports.removeAvatar = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('+avatarPublicId');

  if (!user) {
    return res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: 'User not found.',
    });
  }

  const previousPublicId = user.avatarPublicId;

  user.avatarUrl = '';
  user.avatarPublicId = '';

  await user.save();

  await deleteCloudinaryImage(previousPublicId);

  res.json({
    success: true,
    user: pub(user),
  });
});

exports.getAvatar = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('avatarUrl');

  if (!user?.avatarUrl) {
    return res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: 'No profile picture.',
    });
  }

  if (!user.avatarUrl.startsWith('https://res.cloudinary.com/')) {
    return res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: 'Avatar is not available.',
    });
  }

  return res.redirect(302, user.avatarUrl);
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const lock = await security.lockStatus(req.user.email);

  if (lock.locked) {
    res.set('Retry-After', String(lock.retryAfterSec));

    return res.status(429).json({
      success: false,
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Too many attempts. Please try again in a few minutes.',
    });
  }

  const u = await User.findById(req.user._id).select('+password');

  if (!(await u.matchPassword(currentPassword))) {
    await security.recordFailure(u.email);
    await security.recordEvent(u._id, 'password_change_failed', req);

    return res.status(403).json({
      success: false,
      code: 'WRONG_PASSWORD',
      message: 'Your current password is incorrect.',
    });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Choose a password you have not used just now.',
    });
  }

  u.password = newPassword;
  u.tokenVersion = (u.tokenVersion || 0) + 1;

  await u.save();

  await security.clearFailures(u.email);
  await security.recordEvent(u._id, 'password_changed', req);

  require('../sockets').revokeUserSockets(u._id);

  const token = setAuthCookie(res, u);

  res.json({
    success: true,
    token,
    user: pub(u),
  });
});

exports.securityEvents = asyncHandler(async (req, res) => {
  const rows = await SecurityEvent.find({
    userId: req.user._id,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.json({
    success: true,
    events: rows.map((e) => ({
      id: e._id,
      type: e.type,
      ip: e.ip,
      userAgent: e.userAgent,
      createdAt: e.createdAt,
    })),
  });
});

exports.getLang = (req, res) =>
  res.json({
    success: true,
    languagePreferences: req.user.languagePreferences,
  });

exports.putLang = asyncHandler(async (req, res) => {
  Object.entries(req.body).forEach(([key, value]) => {
    req.user.languagePreferences[key] = value;
  });

  await req.user.save();

  res.json({
    success: true,
    languagePreferences: req.user.languagePreferences,
  });
});
