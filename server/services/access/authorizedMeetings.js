// THE single source of truth for who may see which meeting. Permissions are recomputed on every call; never cache.
const Workspace = require('../../models/Workspace');
const Meeting = require('../../models/Meeting');

// RECORDS access (transcript, summary, translations, tasks, search, meeting details, recording upload):
// host always; invited people, participants and workspace members (unless private) for NORMAL meetings.
// A SEMINAR's records belong to the host alone: invited people, participants and the whole workspace are excluded.
const whoCanSee = (user, wsIds) => [
  { hostId: user._id },
  { seminar: { $ne: true }, $or: [
    { 'participants.userId': user._id }, { invitedUserIds: user._id },
    { workspaceId: { $in: wsIds }, visibility: { $ne: 'private' } },
  ] },
];

async function accessQuery(user, extra = {}) {
  const wsIds = await Workspace.find({ 'members.userId': user._id }).distinct('_id');
  return { ...extra, isDeleted: false, $or: whoCanSee(user, wsIds) };
}

async function getAuthorizedMeetingIds(user, { workspaceId, meetingIds, from, to } = {}) {
  const wsIds = await Workspace.find({ 'members.userId': user._id }).distinct('_id');
  const q = { isDeleted: false, $or: whoCanSee(user, wsIds) };
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

// LIVE access: may this user enter the live room, chat and react? Deliberately separate from records access above.
// Normal meetings: same as records access. Seminars: the host; anyone signed in when the host opened the link; otherwise invited
// people or (unless private) workspace members. Being allowed in live NEVER grants any record.
async function canJoinLive(user, meeting) {
  if (!meeting || meeting.isDeleted) return false;
  if (meeting.hostId.equals(user._id)) return true;
  if (!meeting.seminar) return !!(await getAccessibleMeeting(user, meeting._id));
  if (meeting.openLink) return true;
  if (meeting.invitedUserIds.some((i) => i.equals(user._id))) return true;
  if (meeting.visibility === 'private') return false;
  return !!(await Workspace.exists({ _id: meeting.workspaceId, 'members.userId': user._id }));
}
async function canJoinLiveById(user, meetingId) {
  if (!/^[a-f\d]{24}$/i.test(String(meetingId))) return false;
  return canJoinLive(user, await Meeting.findById(meetingId));
}

module.exports = { accessQuery, getAuthorizedMeetingIds, getAccessibleMeeting, canJoinLive, canJoinLiveById };