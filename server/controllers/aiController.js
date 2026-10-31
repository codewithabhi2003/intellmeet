const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const langs = require('../services/ai/languages');
const { resolveLanguage } = require('../utils/languagePrefs');
const Workspace = require('../models/Workspace');
const Transcript = require('../models/Transcript');
const TranscriptSegment = require('../models/TranscriptSegment');
const Translation = require('../models/Translation');
const Summary = require('../models/Summary');
const tx = require('../services/ai/transcriptionService');
const trans = require('../services/ai/translationService');
const sum = require('../services/ai/summaryService');
const { AIError } = require('../utils/aiErrors');

const forbid = (res) => res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Only the host or a workspace admin can do this.' });
const isHostOrAdmin = async (user, meeting) => {
  if (meeting.hostId.equals(user._id)) return true;
  const ws = await Workspace.findById(meeting.workspaceId);
  const m = ws?.members.find((x) => x.userId.equals(user._id));
  return !!m && ['owner', 'admin'].includes(m.role);
};

const need = (code, cap) => { if (!langs.supports(code, cap)) throw new AIError('UNSUPPORTED_LANGUAGE'); };
const codeStr = z.string().min(1).max(12);

exports.languages = (req, res) => res.json({ success: true, languages: langs.list() });

// ---- transcription ----
exports.startSchema = z.object({ language: codeStr.optional() }).strict();
exports.pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(500).default(200) });

const start = (retryOnly) => asyncHandler(async (req, res) => {
  const meeting = req.meeting;
  if (!(await isHostOrAdmin(req.user, meeting))) return forbid(res);
  const existing = await Transcript.findOne({ meetingId: meeting._id });
  if (retryOnly && existing?.status !== 'failed')
    return res.status(409).json({ success: false, code: 'CONFLICT', message: 'Only a failed transcription can be retried.' });
  // auto-detect only when the meeting enables it and no explicit language was given
  const explicit = req.body?.language;
  const language = explicit || (meeting.languageSettings.autoDetect ? undefined
    : resolveLanguage('transcript', { meeting, user: req.user }));
  if (language) need(language, 'transcription');
  const job = await tx.enqueue(meeting);
  if (!job) return res.status(409).json({ success: false, code: 'CONFLICT', message: 'Transcription is already in progress.' });
  setImmediate(() => tx.run(meeting, { language }));
  res.status(202).json({ success: true, status: 'queued' });
});
exports.startTranscription = start(false);
exports.retryTranscription = start(true);

exports.transcriptStatus = asyncHandler(async (req, res) => {
  const t = await Transcript.findOne({ meetingId: req.meeting._id });
  res.json({ success: true, transcript: t ? meta(t) : { status: 'none' } });
});
const meta = (t) => ({ status: t.status, failureCode: t.failureCode, sourceLanguage: t.sourceLanguage, languageDetected: t.languageDetected,
  durationSec: t.durationSec, segmentCount: t.segmentCount, hasSpeakerLabels: t.hasSpeakerLabels, model: t.model, updatedAt: t.updatedAt });

exports.getTranscript = asyncHandler(async (req, res) => {
  const { page, limit } = req.validated.query;
  const t = await Transcript.findOne({ meetingId: req.meeting._id });
  const segments = await TranscriptSegment.find({ meetingId: req.meeting._id }).sort({ idx: 1 }).skip((page - 1) * limit).limit(limit)
    .select('idx start end text speakerLabel language').lean();     // embeddings are select:false and never returned
  res.json({ success: true, transcript: t ? meta(t) : { status: 'none' }, segments, page, limit, total: t?.segmentCount || 0 });
});

// ---- translation ----
exports.translateSchema = z.object({ targetLanguage: codeStr }).strict();
exports.langParam = z.object({ id: z.string(), lang: codeStr });
exports.requestTranslation = asyncHandler(async (req, res) => {
  need(req.body.targetLanguage, 'translation');
  const r = await trans.request(req.meeting, req.body.targetLanguage);
  if (r.state === 'no_transcript') return res.status(409).json({ success: false, code: 'CONFLICT', message: 'No transcript to translate yet.' });
  if (r.state === 'same_language') return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'The transcript is already in that language.' });
  if (r.state === 'completed') return res.json({ success: true, status: 'completed', translation: tview(r.translation) });
  res.status(202).json({ success: true, status: 'processing' });
});
const tview = (t) => ({ meetingId: t.meetingId, sourceLanguage: t.sourceLanguage, targetLanguage: t.targetLanguage, status: t.status,
  failureCode: t.failureCode, segments: t.segments, model: t.model, label: 'Translated', updatedAt: t.updatedAt });
exports.listTranslations = asyncHandler(async (req, res) => {
  const rows = await Translation.find({ meetingId: req.meeting._id }).select('targetLanguage sourceLanguage status failureCode updatedAt');
  res.json({ success: true, translations: rows.map((t) => ({ targetLanguage: t.targetLanguage, sourceLanguage: t.sourceLanguage, status: t.status, failureCode: t.failureCode, updatedAt: t.updatedAt })) });
});
exports.getTranslation = asyncHandler(async (req, res) => {
  need(req.params.lang, 'translation');
  const t = await Translation.findOne({ meetingId: req.meeting._id, targetLanguage: req.params.lang });
  if (!t) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No translation in that language.' });
  res.json({ success: true, translation: tview(t) });
});

// ---- summary ----
exports.summarySchema = z.object({ language: codeStr.optional(), regenerate: z.boolean().optional() }).strict();
exports.summaryQuery = z.object({ language: codeStr.optional() });
const sview = (s) => ({ meetingId: s.meetingId, language: s.language, sourceLanguage: s.sourceLanguage, model: s.model, overview: s.overview,
  discussionPoints: s.discussionPoints, decisions: s.decisions, openQuestions: s.openQuestions, risks: s.risks,
  actionItems: s.actionItems, generatedAt: s.generatedAt });
exports.requestSummary = asyncHandler(async (req, res) => {
  const language = resolveLanguage('summary', { explicit: req.body.language, meeting: req.meeting, user: req.user });
  need(language, 'translation');
  const r = await sum.request(req.meeting, language, { regenerate: req.body.regenerate, userId: req.user._id });
  if (r.state === 'no_transcript') return res.status(409).json({ success: false, code: 'CONFLICT', message: 'Generate a transcript first.' });
  if (r.state === 'completed') return res.json({ success: true, status: 'completed', summary: sview(r.summary) });
  res.status(202).json({ success: true, status: 'processing', language });
});
exports.getSummary = asyncHandler(async (req, res) => {
  const language = resolveLanguage('summary', { explicit: req.validated.query.language, meeting: req.meeting, user: req.user });
  need(language, 'translation');
  const s = await Summary.findOne({ meetingId: req.meeting._id, language });
  if (s) return res.json({ success: true, status: 'completed', summary: sview(s) });
  const job = sum.status(req.meeting._id, language);
  res.json({ success: true, status: job?.status || 'none', failureCode: job?.code || null, language });
});
