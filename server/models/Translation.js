const mongoose = require('mongoose');
const { Schema } = mongoose;
const s = new Schema({
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  sourceLanguage: String, targetLanguage: { type: String, required: true },
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
  failureCode: { type: String, default: null },
  segments: [{ _id: false, idx: Number, text: String }],
  model: String,
}, { timestamps: true });
s.index({ meetingId: 1, targetLanguage: 1 }, { unique: true });   // doubles as dedupe/cache
module.exports = mongoose.model('Translation', s);
