const { z } = require('zod');
const Summary = require('../../models/Summary');
const Transcript = require('../../models/Transcript');
const TranscriptSegment = require('../../models/TranscriptSegment');
const Task = require('../../models/Task');
const User = require('../../models/User');
const Workspace = require('../../models/Workspace');
const { env } = require('../../config/aiConfig');
const { emitStatus } = require('../../utils/realtime');
const gemini = require('./providers/geminiProvider');
const P = require('./promptTemplates');

const CHUNK_CHARS = 24000;
const actionItem = z.object({
  title: z.string().min(1), description: z.string().nullable(), ownerName: z.string().nullable(),
  deadlineText: z.string().nullable(), deadlineISO: z.string().nullable(), sourceSegmentIdx: z.number().int().nullable(),
});
const summarySchema = z.object({
  overview: z.string(), discussionPoints: z.array(z.string()), decisions: z.array(z.string()),
  openQuestions: z.array(z.string()), risks: z.array(z.string()), actionItems: z.array(actionItem),
});
const existingSchema = summarySchema.omit({ actionItems: true }).extend({
  actionItems: z.array(z.object({ n: z.number().int(), title: z.string().min(1), description: z.string().nullable() })),
});
exports.summarySchema = summarySchema;

// In-process job tracking (single server process; see README for scaling notes).
const jobs = new Map();
exports.status = (meetingId, language) => jobs.get(`${meetingId}:${language}`) || null;

exports.request = async (meeting, language, { regenerate = false, userId } = {}) => {
  const tr = await Transcript.findOne({ meetingId: meeting._id });
  if (!tr || !tr.segmentCount) return { state: 'no_transcript' };
  if (!regenerate) {
    const ex = await Summary.findOne({ meetingId: meeting._id, language });
    if (ex) return { state: 'completed', summary: ex };
  }
  const key = `${meeting._id}:${language}`;
  if (jobs.get(key)?.status === 'processing') return { state: 'processing' };
  jobs.set(key, { status: 'processing' });
  emitStatus(meeting, 'summary:status', { status: 'processing', language });
  setImmediate(() => exports.run(meeting, language, tr.sourceLanguage, key, userId));
  return { state: 'started' };
};

const chunkLines = (lines) => {
  const chunks = []; let cur = [], len = 0;
  for (const l of lines) {
    if (len + l.length > CHUNK_CHARS && cur.length) { chunks.push(cur); cur = []; len = 0; }
    cur.push(l); len += l.length + 1;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
};

// ownerName -> assigneeId ONLY on an exact, unambiguous match among meeting participants who are workspace members.
const matchOwner = async (meeting, ownerName) => {
  if (!ownerName) return null;
  const ids = [meeting.hostId, ...meeting.participants.map((p) => p.userId)];
  const ws = await Workspace.findById(meeting.workspaceId).select('members.userId');
  const memberIds = new Set((ws?.members || []).map((m) => String(m.userId)));
  const users = await User.find({ _id: { $in: ids } }).select('name');
  const hits = users.filter((u) => memberIds.has(String(u._id)) && u.name.trim().toLowerCase() === ownerName.trim().toLowerCase());
  return hits.length === 1 ? hits[0]._id : null;
};
const validISO = (s) => { if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null; const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; };

exports.run = async (meeting, language, sourceLanguage, key, userId) => {
  try {
    const segs = await TranscriptSegment.find({ meetingId: meeting._id }).sort({ idx: 1 }).select('idx text').lean();   // ORIGINAL transcript
    const valid = new Set(segs.map((s) => s.idx));
    const date = (meeting.startedAt || meeting.scheduledAt || meeting.createdAt).toISOString().slice(0, 10);
    const lines = segs.map((s) => `[${s.idx}] ${s.text}`);
    const existingTasks = await Task.find({ meetingId: meeting._id, source: 'ai' }).sort({ createdAt: 1, _id: 1 });

    let data;
    if (existingTasks.length) {
      const canon = existingTasks.map((t, i) => ({ n: i, title: t.title, description: t.description || null }));
      const user = `CANONICAL ACTION ITEMS:\n${JSON.stringify(canon)}\n\nTRANSCRIPT:\n${lines.join('\n')}`;
      data = await gemini.generateJSON({ system: P.SUMMARY_EXISTING_TASKS_SYSTEM(language, date), user, schema: existingSchema, retry: 1, label: 'summary-existing' });
    } else {
      const parts = chunkLines(lines);
      if (parts.length === 1) {
        data = await gemini.generateJSON({ system: P.SUMMARY_SYSTEM(language, date), user: `TRANSCRIPT:\n${parts[0].join('\n')}`, schema: summarySchema, retry: 1, label: 'summary' });
      } else {   // map-reduce for long transcripts
        const partial = [];
        for (const p of parts) partial.push(await gemini.generateJSON({ system: P.SUMMARY_SYSTEM(language, date), user: `TRANSCRIPT PART:\n${p.join('\n')}`, schema: summarySchema, retry: 1, label: 'summary-chunk' }));
        data = await gemini.generateJSON({ system: P.SUMMARY_MERGE_SYSTEM(language, date), user: `PARTIAL SUMMARIES:\n${JSON.stringify(partial)}`, schema: summarySchema, retry: 1, label: 'summary-merge' });
      }
    }

    let taskDocs = existingTasks, display;
    if (existingTasks.length) {
      const byN = new Map(data.actionItems.map((a) => [a.n, a]));
      display = existingTasks.map((t, i) => ({ taskId: t._id, title: byN.get(i)?.title || t.title, description: byN.get(i)?.description ?? t.description ?? '' }));
    } else {
      taskDocs = [];
      for (const a of data.actionItems) {
        taskDocs.push(await Task.create({
          title: a.title, description: a.description || '', workspaceId: meeting.workspaceId, meetingId: meeting._id,
          assigneeId: await matchOwner(meeting, a.ownerName), ownerText: a.ownerName, deadlineText: a.deadlineText,
          deadline: validISO(a.deadlineISO), source: 'ai', needsReview: true,
          sourceSegmentIdx: a.sourceSegmentIdx != null && valid.has(a.sourceSegmentIdx) ? a.sourceSegmentIdx : null, createdBy: userId || meeting.hostId,
        }));
      }
      display = taskDocs.map((t) => ({ taskId: t._id, title: t.title, description: t.description }));
    }

    await Summary.findOneAndUpdate({ meetingId: meeting._id, language }, { $set: {
      sourceLanguage, model: env.LANGUAGE_MODEL, overview: data.overview, discussionPoints: data.discussionPoints, decisions: data.decisions,
      openQuestions: data.openQuestions, risks: data.risks, actionItemIds: taskDocs.map((t) => t._id), actionItems: display, generatedAt: new Date() } }, { upsert: true });
    jobs.set(key, { status: 'completed' });
    emitStatus(meeting, 'summary:status', { status: 'completed', language });
  } catch (e) {
    jobs.set(key, { status: 'failed', code: e.code || 'PROCESSING_FAILED' });
    emitStatus(meeting, 'summary:status', { status: 'failed', language });
  }
};
