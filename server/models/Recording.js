const mongoose = require('mongoose');
const { Schema } = mongoose;
const s = new Schema({
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  filePath: { type: String, required: true, select: false },   // server-side only, never sent to clients
  mimeType: String, sizeBytes: Number, durationSec: { type: Number, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
module.exports = mongoose.model('Recording', s);
