const crypto = require('crypto');
const LoginAttempt = require('../models/LoginAttempt');
const SecurityEvent = require('../models/SecurityEvent');

// 5 wrong passwords for one email address -> that address is locked for 15 minutes. Counted per address (hashed), never per account,
// so an unknown email behaves exactly like a real one and the lock can't be used to discover who is registered.
const MAX_FAILURES = 5, LOCK_MS = 15 * 60 * 1000, WINDOW_MS = 15 * 60 * 1000;
const keyFor = (email) => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

exports.lockStatus = async (email) => {
  const a = await LoginAttempt.findOne({ key: keyFor(email) });
  if (a?.lockedUntil && a.lockedUntil > new Date()) return { locked: true, retryAfterSec: Math.ceil((a.lockedUntil - Date.now()) / 1000) };
  return { locked: false };
};
exports.recordFailure = async (email) => {
  const key = keyFor(email), now = new Date();
  const a = await LoginAttempt.findOne({ key });
  const fresh = !a || !a.lastFailureAt || now - a.lastFailureAt > WINDOW_MS || (a.lockedUntil && a.lockedUntil <= now);
  const failures = fresh ? 1 : a.failures + 1;
  const lockedUntil = failures >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MS) : null;
  await LoginAttempt.findOneAndUpdate({ key }, { $set: { failures: lockedUntil ? 0 : failures, lastFailureAt: now, lockedUntil, updatedAt: now } }, { upsert: true });
  return { locked: !!lockedUntil };
};
exports.clearFailures = (email) => LoginAttempt.deleteOne({ key: keyFor(email) });

// Logging must never break the request it describes.
exports.recordEvent = (userId, type, req) =>
  SecurityEvent.create({ userId, type, ip: req?.ip, userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 200) }).catch(() => {});
exports.MAX_FAILURES = MAX_FAILURES;