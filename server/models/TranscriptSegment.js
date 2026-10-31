const mongoose = require('mongoose');
const { Schema } = mongoose;
// ORIGINAL text, immutable. Translations live in Translation.
const s = new Schema({
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  idx: { type: Number, required: true },
  start: Number, end: Number,
  text: { type: String, required: true },
  speakerLabel: { type: String, default: null },
  language: { type: String, default: null },
  embedding: { type: [Number], select: false },
}, { timestamps: { createdAt: true, updatedAt: false } });
s.index({ meetingId: 1, idx: 1 }, { unique: true });
// default_language none: there is no Hindi stemmer, so disable stemming.
s.index({ text: 'text' }, { default_language: 'none', name: 'segment_text' });
module.exports = mongoose.model('TranscriptSegment', s);
