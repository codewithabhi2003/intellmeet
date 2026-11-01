const mongoose = require('mongoose');
const { Schema } = mongoose;
const s = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 300 },
  description: { type: String, default: '', maxlength: 4000 },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', default: null },
  assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  deadline: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'in_progress', 'done'], default: 'pending' },
  source: { type: String, enum: ['manual', 'ai'], default: 'manual' },
  needsReview: { type: Boolean, default: false },
  ownerText: { type: String, default: null },      // owner exactly as stated in the meeting (AI tasks)
  deadlineText: { type: String, default: null },   // deadline phrase exactly as stated (AI tasks)
  sourceSegmentIdx: { type: Number, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: true, updatedAt: false } });
s.index({ workspaceId: 1, status: 1 });
s.index({ meetingId: 1 });
module.exports = mongoose.model('Task', s);
