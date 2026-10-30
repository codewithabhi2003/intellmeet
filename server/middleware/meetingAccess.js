const asyncHandler = require('express-async-handler');
const { getAccessibleMeeting } = require('../services/access/authorizedMeetings');
// Reuses the single access check for every :id / :meetingId route.
module.exports = asyncHandler(async (req, res, next) => {
  const meeting = await getAccessibleMeeting(req.user, req.params.meetingId || req.params.id);
  if (!meeting) return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You do not have access to this meeting.' });
  req.meeting = meeting;
  next();
});
