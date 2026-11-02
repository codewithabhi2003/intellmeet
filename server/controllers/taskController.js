const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const Task = require('../models/Task');
const Workspace = require('../models/Workspace');

const oid = z.string().regex(/^[a-f\d]{24}$/i);
exports.createSchema = z.object({
  title: z.string().trim().min(1).max(300), description: z.string().max(4000).optional(), workspaceId: oid,
  meetingId: oid.nullable().optional(), assigneeId: oid.nullable().optional(), deadline: z.coerce.date().nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'done']).optional(),
}).strict();
exports.updateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(), description: z.string().max(4000).optional(),
  assigneeId: oid.nullable().optional(), deadline: z.coerce.date().nullable().optional(),
  status: z.enum(['pending', 'in_progress', 'done']).optional(), needsReview: z.boolean().optional(),
}).strict();
exports.listSchema = z.object({
  meetingId: oid.optional(), workspaceId: oid.optional(), status: z.enum(['pending', 'in_progress', 'done']).optional(),
  needsReview: z.enum(['true', 'false']).optional(), limit: z.coerce.number().int().min(1).max(200).default(100),
});

const { getAuthorizedMeetingIds, getAccessibleMeeting } = require('../services/access/authorizedMeetings');
const myWorkspaceIds = (user) => Workspace.find({ 'members.userId': user._id }).distinct('_id');
const assigneeOk = async (wsId, assigneeId) => !assigneeId || !!(await Workspace.exists({ _id: wsId, 'members.userId': assigneeId }));
const view = (t) => ({ id: t._id, title: t.title, description: t.description, workspaceId: t.workspaceId, meetingId: t.meetingId,
  assigneeId: t.assigneeId, deadline: t.deadline, status: t.status, source: t.source, needsReview: t.needsReview,
  sourceSegmentIdx: t.sourceSegmentIdx, ownerText: t.ownerText, deadlineText: t.deadlineText, createdBy: t.createdBy, createdAt: t.createdAt });
const forbid = (res) => res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You do not have access to this task.' });

exports.create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!(await Workspace.exists({ _id: b.workspaceId, 'members.userId': req.user._id }))) return forbid(res);
  if (b.meetingId) {
    const m = await getAccessibleMeeting(req.user, b.meetingId);        // you can only attach a task to a meeting you can open
    if (!m) return forbid(res);
    if (String(m.workspaceId) !== String(b.workspaceId)) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Meeting is not in that workspace.' });
  }
  if (!(await assigneeOk(b.workspaceId, b.assigneeId))) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Assignee must be a workspace member.' });
  const t = await Task.create({ ...b, source: 'manual', needsReview: false, createdBy: req.user._id });
  res.status(201).json({ success: true, task: view(t) });
});
exports.list = asyncHandler(async (req, res) => {
  const { meetingId, workspaceId, status, needsReview, limit } = req.validated.query;
  const ws = await myWorkspaceIds(req.user);
  const meetingIds = await getAuthorizedMeetingIds(req.user);
  // Two kinds of task, two rules: a task made from a meeting (e.g. AI action items taken from its transcript) is visible to
  // exactly the people who can open that meeting; a task with no meeting is visible to the workspace's members.
  const q = { $or: [{ meetingId: { $in: meetingIds } }, { meetingId: null, workspaceId: { $in: ws } }] };
  if (workspaceId) q.workspaceId = ws.some((w) => w.equals(workspaceId)) ? workspaceId : { $in: [] };
  if (meetingId) q.meetingId = meetingId;
  if (status) q.status = status;
  if (needsReview) q.needsReview = needsReview === 'true';
  const tasks = await Task.find(q).sort({ createdAt: -1 }).limit(limit);
  res.json({ success: true, tasks: tasks.map(view) });
});
const load = async (req) => {
  const t = await Task.findById(req.params.id);
  if (!t) return null;
  if (t.meetingId) return (await getAccessibleMeeting(req.user, t.meetingId)) ? t : null;          // follows the meeting's access rules
  return (await Workspace.exists({ _id: t.workspaceId, 'members.userId': req.user._id })) ? t : null;
};
exports.get = asyncHandler(async (req, res) => { const t = await load(req); return t ? res.json({ success: true, task: view(t) }) : forbid(res); });
exports.update = asyncHandler(async (req, res) => {
  const t = await load(req); if (!t) return forbid(res);
  if (req.body.assigneeId !== undefined && !(await assigneeOk(t.workspaceId, req.body.assigneeId)))
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Assignee must be a workspace member.' });
  Object.assign(t, req.body); await t.save();
  res.json({ success: true, task: view(t) });
});
exports.remove = asyncHandler(async (req, res) => {
  const t = await load(req); if (!t) return forbid(res);
  await t.deleteOne(); res.json({ success: true });
});