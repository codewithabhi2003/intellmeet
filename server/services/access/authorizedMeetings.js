// THE single source of truth for who may see which meeting. Permissions are recomputed on every call; never cache.
const Workspace = require('../../models/Workspace');
const Meeting = require('../../models/Meeting');

async function accessQuery(user, extra = {}) {
  const wsIds = await Workspace.find({ 'members.userId': user._id }).distinct('_id');
  return {
    ...extra,
    isDeleted: false,
    $or: [
      { hostId: user._id }, { 'participants.userId': user._id },
      { invitedUserIds: user._id }, { workspaceId: { $in: wsIds } },
    ],
  };
}

async function getAuthorizedMeetingIds(user, { workspaceId, meetingIds, from, to } = {}) {
  const wsIds = await Workspace.find({ 'members.userId': user._id }).distinct('_id');
  const q = {
    isDeleted: false,
    $or: [{ hostId: user._id }, { 'participants.userId': user._id }, { invitedUserIds: user._id }, { workspaceId: { $in: wsIds } }],
  };
  if (workspaceId) {
    if (!wsIds.some((w) => w.equals(workspaceId))) return [];
    q.workspaceId = workspaceId;
  }
  if (meetingIds?.length) q._id = { $in: meetingIds };
  if (from || to) q.startedAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  return Meeting.find(q).distinct('_id');
}

// Returns the meeting document if the user may access it, else null.
async function getAccessibleMeeting(user, meetingId) {
  if (!/^[a-f\d]{24}$/i.test(String(meetingId))) return null;
  return Meeting.findOne(await accessQuery(user, { _id: meetingId }));
}

module.exports = { accessQuery, getAuthorizedMeetingIds, getAccessibleMeeting };
