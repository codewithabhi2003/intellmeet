const mongoose = require('mongoose');
const { Schema } = mongoose;
const s = new Schema({
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
  language: { type: String, required: true }, sourceLanguage: String, model: String,
  overview: String, discussionPoints: [String], decisions: [String], openQuestions: [String], risks: [String],
  actionItemIds: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
  // display-language action items (canonical Task fields are never mutated)
  actionItems: [{ _id: false, taskId: Schema.Types.ObjectId, title: String, description: String }],
  generatedAt: { type: Date, default: Date.now },
});
s.index({ meetingId: 1, language: 1 }, { unique: true });
module.exports = mongoose.model('Summary', s);
