const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const Meeting = require('../models/Meeting');
const Workspace = require('../models/Workspace');
const User = require('../models/User');
const ChatMessage = require('../models/ChatMessage');
const Recording = require('../models/Recording');
const { accessQuery } = require('../services/access/authorizedMeetings');
const svc = require('../services/meetingService');

const oid = z.string().regex(/^[a-f\d]{24}$/i);
const langs = require('../services/ai/languages');
const lang = langs.codeSchema().nullable();
const langSettings = z.object({
  primaryLanguage: langs.codeSchema().optional(),
  autoDetect: z.boolean().optional(), transcriptLanguage: lang.optional(), summaryLanguage: lang.optional(),
}).strict();

exports.createSchema = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().max(2000).optional(),
  scheduledAt: z.coerce.date().optional(),
  workspaceId: oid.optional(),
  invitedEmails: z.array(z.string().trim().email()).max(50).optional(),
  languageSettings: langSettings.optional(),
  instant: z.boolean().optional(),
  // The link/code can be shown BEFORE the meeting exists, so the browser generates the code (12 url-safe chars, same shape as the server's own).
  roomCode: z.string().regex(/^[A-Za-z0-9_-]{12}$/).optional(),
  waitingRoom: z.boolean().optional(),
}).strict();
exports.patchSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(), description: z.string().max(2000).optional(),
  scheduledAt: z.coerce.date().optional(), status: z.literal('cancelled').optional(),
  invitedEmails: z.array(z.string().trim().email()).max(50).optional(),
}).strict();
exports.listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['scheduled', 'live', 'ended', 'cancelled']).optional(), workspaceId: oid.optional(),
});
exports.joinSchema = z.object({ roomCode: z.string().min(6).max(64) }).strict();
exports.langSettingsSchema = langSettings;
exports.messagesSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), before: z.coerce.date().optional() });

const view = (m) => ({
  id: m._id, title: m.title, description: m.description, hostId: m.hostId, workspaceId: m.workspaceId,
  scheduledAt: m.scheduledAt, startedAt: m.startedAt, endedAt: m.endedAt, status: m.status, roomCode: m.roomCode,
  participants: m.participants, invitedUserIds: m.invitedUserIds, languageSettings: m.languageSettings,
  waitingRoom: !!m.waitingRoom, recordingConsent: { required: m.recordingConsent?.required, acceptedBy: m.recordingConsent?.acceptedBy }, createdAt: m.createdAt,
});
exports.view = view;

const resolveEmails = async (emails = []) => {
  const users = await User.find({ email: { $in: emails.map((e) => e.toLowerCase()) } }).select('_id email');
  const found = new Set(users.map((u) => u.email));
  return { ids: users.map((u) => u._id), unknownEmails: emails.filter((e) => !found.has(e.toLowerCase())) };
};

exports.rtcConfig = (req, res) => {
  const iceServers = [];
  const stun = (process.env.STUN_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (stun.length) iceServers.push({ urls: stun });
  if (process.env.TURN_URL) iceServers.push({ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  res.json({ success: true, iceServers });
};

exports.create = asyncHandler(async (req, res) => {
  const b = req.body;
  let ws;
  if (b.workspaceId) ws = await Workspace.findOne({ _id: b.workspaceId, 'members.userId': req.user._id });
  else ws = await Workspace.findOne({ 'members.userId': req.user._id, 'members.role': 'owner' }).sort({ createdAt: 1 });
  if (!ws) return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You are not a member of that workspace.' });
  const { ids, unknownEmails } = await resolveEmails(b.invitedEmails);
  const meeting = await Meeting.create({
    title: b.title, description: b.description, hostId: req.user._id, workspaceId: ws._id,
    scheduledAt: b.scheduledAt || (b.instant ? new Date() : undefined),
    invitedUserIds: ids.filter((i) => !i.equals(req.user._id)),
    languageSettings: b.languageSettings,
    roomCode: b.roomCode,                          // undefined -> the model generates one
    waitingRoom: !!b.waitingRoom,
    ...(b.instant ? { status: 'live', startedAt: new Date() } : {}),
  });
  res.status(201).json({ success: true, meeting: view(meeting), unknownEmails });
});

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, status, workspaceId } = req.validated.query;
  const extra = {};
  if (status) extra.status = status;
  if (workspaceId) extra.workspaceId = workspaceId;
  const q = await accessQuery(req.user, extra);
  const [items, total] = await Promise.all([
    Meeting.find(q).sort({ startedAt: -1, scheduledAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Meeting.countDocuments(q),
  ]);
  res.json({ success: true, meetings: items.map(view), page, limit, total });
});

exports.get = (req, res) => res.json({ success: true, meeting: view(req.meeting) });

const isHostOrWsAdmin = async (user, meeting) => {
  if (meeting.hostId.equals(user._id)) return true;
  const ws = await Workspace.findById(meeting.workspaceId);
  const m = ws?.members.find((x) => x.userId.equals(user._id));
  return !!m && ['owner', 'admin'].includes(m.role);
};

exports.patch = asyncHandler(async (req, res) => {
  const m = req.meeting;
  if (!m.hostId.equals(req.user._id)) return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Only the host can edit this meeting.' });
  const { invitedEmails, status, ...rest } = req.body;
  if (status === 'cancelled') {
    if (m.status !== 'scheduled') return res.status(409).json({ success: false, code: 'CONFLICT', message: 'Only scheduled meetings can be cancelled.' });
    m.status = 'cancelled';
  }
  Object.assign(m, rest);
  let unknownEmails = [];
  if (invitedEmails) {
    const r = await resolveEmails(invitedEmails); unknownEmails = r.unknownEmails;
    m.invitedUserIds = r.ids.filter((i) => !i.equals(m.hostId));
  }
  await m.save();
  res.json({ success: true, meeting: view(m), unknownEmails });
});

exports.remove = asyncHandler(async (req, res) => {
  const m = req.meeting;
  if (!(await isHostOrWsAdmin(req.user, m))) return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You cannot delete this meeting.' });
  m.isDeleted = true; m.deletedAt = new Date();
  await m.save();
  await svc.cascadeDelete(m._id);
  res.json({ success: true });
});

exports.join = asyncHandler(async (req, res) => {
  const meeting = await Meeting.findOne(await accessQuery(req.user, { roomCode: req.body.roomCode }));
  if (!meeting) return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You do not have access to this meeting.' });
  const c = svc.canJoin(meeting, req.user._id);
  if (!c.ok) return res.status(c.code === 'REMOVED' ? 403 : 409).json({ success: false, code: c.code, message: c.message });
  // with a waiting room, people are only recorded as participants once the host lets them in (the socket join does that)
  const waits = meeting.waitingRoom && !meeting.hostId.equals(req.user._id) && !meeting.admittedUserIds.some((i) => i.equals(req.user._id));
  if (!waits) await svc.markJoined(meeting, req.user._id);
  const fresh = await Meeting.findById(meeting._id);
  res.json({ success: true, meeting: view(fresh) });
});

exports.end = asyncHandler(async (req, res) => {
  const m = req.meeting;
  if (!m.hostId.equals(req.user._id)) return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Only the host can end the meeting.' });
  if (m.status !== 'live') return res.status(409).json({ success: false, code: 'CONFLICT', message: 'Meeting is not live.' });
  const now = new Date();
  m.status = 'ended'; m.endedAt = now;
  m.participants.forEach((p) => { if (!p.leftAt) p.leftAt = now; });
  await m.save();
  require('../sockets').emitToRoom(m.roomCode, 'meeting:ended', { meetingId: m._id });
  require('../sockets').closeLobby(m.roomCode, m._id);          // people still waiting are told the meeting is over
  res.json({ success: true, meeting: view(m) });
});

exports.setLanguageSettings = asyncHandler(async (req, res) => {
  const m = req.meeting;
  if (!(await isHostOrWsAdmin(req.user, m))) return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You cannot change these settings.' });
  Object.assign(m.languageSettings, req.body);
  await m.save();
  res.json({ success: true, languageSettings: m.languageSettings });
});

exports.messages = asyncHandler(async (req, res) => {
  const { limit, before } = req.validated.query;
  const q = { meetingId: req.meeting._id, ...(before && { createdAt: { $lt: before } }) };
  const rows = await ChatMessage.find(q).sort({ createdAt: -1 }).limit(limit).populate('senderId', 'name avatarUrl');
  res.json({ success: true, messages: rows.reverse().map((r) => ({
    id: r._id, meetingId: r.meetingId, sender: { id: r.senderId?._id, name: r.senderId?.name }, text: r.text, createdAt: r.createdAt })) });
});

exports.consent = asyncHandler(async (req, res) => {
  await Meeting.updateOne({ _id: req.meeting._id }, { $addToSet: { 'recordingConsent.acceptedBy': req.user._id } });
  res.json({ success: true });
});

exports.uploadRecording = asyncHandler(async (req, res) => {
  const fs = require('fs');
  const drop = () => req.file && fs.unlink(req.file.path, () => {});
  if (!req.file) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'No audio file received.' });
  const m = req.meeting;
  const consented = (m.recordingConsent?.acceptedBy || []).some((i) => i.equals(req.user._id));
  if (m.recordingConsent?.required && !consented) {
    drop();
    return res.status(403).json({ success: false, code: 'CONSENT_REQUIRED', message: 'Recording consent is required first.' });
  }
  const dur = Number(req.body?.durationSec);
  const rec = await Recording.create({
    meetingId: m._id, uploadedBy: req.user._id, filePath: req.file.path,
    mimeType: (req.file.mimetype || '').split(';')[0], sizeBytes: req.file.size, durationSec: Number.isFinite(dur) && dur > 0 ? dur : null,
  });
  res.status(201).json({ success: true, recording: { id: rec._id, meetingId: rec.meetingId, mimeType: rec.mimeType, sizeBytes: rec.sizeBytes, durationSec: rec.durationSec, createdAt: rec.createdAt } });
});