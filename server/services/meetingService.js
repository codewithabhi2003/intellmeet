const Meeting = require('../models/Meeting');

// Marks a user as present. Only the host may start a scheduled meeting.
exports.markJoined = async (meeting, userId) => {
  // Update by array index instead of MongoDB's positional "$" operator: same result, and it also works on Mongo-compatible
  // databases that do not implement "$". Participants are only ever appended, so an index read just now stays valid.
  const i = meeting.participants.findIndex((p) => p.userId && p.userId.equals(userId));
  if (i >= 0) await Meeting.updateOne({ _id: meeting._id }, { $set: { [`participants.${i}.leftAt`]: null } });
  else await Meeting.updateOne({ _id: meeting._id }, { $push: { participants: { userId, joinedAt: new Date(), leftAt: null } } });
  if (meeting.status === 'scheduled' && meeting.hostId.equals(userId))
    await Meeting.updateOne({ _id: meeting._id, status: 'scheduled' }, { $set: { status: 'live', startedAt: new Date() } });
};
exports.markLeft = async (meetingId, userId) => {
  const m = await Meeting.findById(meetingId).select('participants');
  const i = m ? m.participants.findIndex((p) => p.userId && p.userId.equals(userId)) : -1;
  if (i >= 0) await Meeting.updateOne({ _id: meetingId }, { $set: { [`participants.${i}.leftAt`]: new Date() } });
};

// Cascade for soft delete: derived AI data is removed (models are registered lazily by later phases).
const CASCADE = ['TranscriptSegment', 'Translation', 'Summary', 'Transcript'];
exports.cascadeDelete = async (meetingId) => {
  const mongoose = require('mongoose');
  for (const name of CASCADE) if (mongoose.models[name]) await mongoose.models[name].deleteMany({ meetingId });
};

exports.canJoin = (meeting, userId) => {
  if ((meeting.removedUserIds || []).some((i) => i.equals(userId))) return { ok: false, code: 'REMOVED', message: 'You were removed from this meeting by the host.' };
  if (['ended', 'cancelled'].includes(meeting.status)) return { ok: false, code: 'MEETING_CLOSED', message: 'This meeting has ended.' };
  if (meeting.status === 'scheduled' && !meeting.hostId.equals(userId)) return { ok: false, code: 'NOT_STARTED', message: 'The host has not started this meeting yet.' };
  return { ok: true };
};