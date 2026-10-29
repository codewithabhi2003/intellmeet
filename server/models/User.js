const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false, minlength: 8 },
  avatarUrl: { type: String, default: '' },                       // server-relative path, set only by the upload endpoint
  avatarFile: { type: String, default: '', select: false },       // file name on disk, never sent to clients
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  languagePreferences: {
    transcriptLanguage: { type: String, default: null },
    summaryLanguage: { type: String, default: null },
    searchAnswerLanguage: { type: String, default: null },
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.matchPassword = function (plain) { return bcrypt.compare(plain, this.password); };
module.exports = mongoose.model('User', userSchema);
