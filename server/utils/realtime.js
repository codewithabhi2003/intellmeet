// Best-effort status events to everyone in a meeting room (never throws).
exports.emitStatus = (meeting, event, payload) => {
  try { require('../sockets').emitToRoom(meeting.roomCode, event, { meetingId: String(meeting._id), ...payload }); } catch { /* ignore */ }
};
