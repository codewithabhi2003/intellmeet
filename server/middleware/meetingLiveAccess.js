const asyncHandler = require('express-async-handler');
const Meeting = require('../models/Meeting');
const { canJoinLive } = require('../services/access/authorizedMeetings');
// For routes that belong to the LIVE room (chat history), not to the records. Seminar attendees pass this but not meetingAccess.
module.exports = asyncHandler(async (req, res, next) => {
  const id = String(req.params.meetingId || req.params.id);
  const meeting = /^[a-f\d]{24}$/i.test(id) ? await Meeting.findOne({ _id: id, isDeleted: false }) : null;
  if (!meeting || !(await canJoinLive(req.user, meeting))) return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You do not have access to this meeting.' });
  req.meeting = meeting;
  next();
});