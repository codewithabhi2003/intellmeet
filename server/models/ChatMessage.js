const mongoose = require('mongoose');
const s = new mongoose.Schema({
  meetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 2000 },
}, { timestamps: { createdAt: true, updatedAt: false } });
s.index({ meetingId: 1, createdAt: 1 });
module.exports = mongoose.model('ChatMessage', s);
