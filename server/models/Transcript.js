const mongoose = require('mongoose');
const { Schema } = mongoose;
const s = new Schema({
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true, unique: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  status: { type: String, enum: ['none', 'queued', 'processing', 'completed', 'failed'], default: 'none' },
  failureCode: { type: String, default: null },
  sourceLanguage: { type: String, default: null },
  languageDetected: { type: Boolean, default: false },
  detectionConfidence: { type: Number, default: null },   // Whisper does not return one -> stays null (never invented)
  provider: String, model: String, durationSec: Number,
  segmentCount: { type: Number, default: 0 },
  hasSpeakerLabels: { type: Boolean, default: false },
}, { timestamps: true });
module.exports = mongoose.model('Transcript', s);
