const mongoose = require('mongoose');
// What the account owner sees under Settings > Security. Holds no meeting content, only who/when/what kind of event.
const s = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, enum: ['login_success', 'login_failed', 'account_locked', 'password_changed', 'password_change_failed', 'sessions_revoked', 'email_changed'] },
  ip: String, userAgent: String,
  createdAt: { type: Date, default: Date.now, expires: '180d' },
});
module.exports = mongoose.model('SecurityEvent', s);