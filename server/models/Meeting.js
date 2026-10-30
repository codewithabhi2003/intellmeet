const mongoose = require('mongoose');
const crypto = require('crypto');
const { Schema } = mongoose;
const meetingSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  description: { type: String, default: '', maxlength: 2000 },
  hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  scheduledAt: Date, startedAt: Date, endedAt: Date,
  status: { type: String, enum: ['scheduled', 'live', 'ended', 'cancelled'], default: 'scheduled' },
  roomCode: { type: String, unique: true, default: () => crypto.randomBytes(9).toString('base64url') },
  participants: [{ _id: false, userId: { type: Schema.Types.ObjectId, ref: 'User' }, joinedAt: Date, leftAt: Date }],
  invitedUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  languageSettings: {
    primaryLanguage: { type: String, default: 'en' },
    autoDetect: { type: Boolean, default: false },
    transcriptLanguage: { type: String, default: null },
    summaryLanguage: { type: String, default: null },
  },
  recordingConsent: {
    required: { type: Boolean, default: true },
    acceptedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  waitingRoom: { type: Boolean, default: false },                    // non-hosts wait until the host lets them in
  admittedUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],   // let in by the host (stay admitted for this meeting)
  removedUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],    // removed by the host: cannot rejoin this meeting
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false } });
meetingSchema.index({ workspaceId: 1, startedAt: -1 });
meetingSchema.index({ hostId: 1 });
meetingSchema.index({ 'participants.userId': 1 });
meetingSchema.index({ isDeleted: 1 });
module.exports = mongoose.model('Meeting', meetingSchema);