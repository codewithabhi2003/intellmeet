const mongoose = require('mongoose');
// Failed sign-in counter per EMAIL ADDRESS (stored as a hash), whether or not an account exists, so locking never reveals which emails are registered.
const s = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  failures: { type: Number, default: 0 },
  lockedUntil: Date, lastFailureAt: Date,
  updatedAt: { type: Date, default: Date.now, expires: '1d' },     // old counters disappear on their own
});
module.exports = mongoose.model('LoginAttempt', s);