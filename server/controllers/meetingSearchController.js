const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const { env } = require('../config/aiConfig');
const langs = require('../services/ai/languages');
const { resolveLanguage } = require('../utils/languagePrefs');
const { AIError } = require('../utils/aiErrors');
const search = require('../services/ai/meetingSearchService');

const oid = z.string().regex(/^[a-f\d]{24}$/i);
exports.querySchema = z.object({
  question: z.string().trim().min(1).max(env.SEARCH_MAX_QUERY_CHARS),
  dateRange: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).strict().optional(),
  workspaceId: oid.optional(), meetingIds: z.array(oid).max(50).optional(),
  answerLanguage: z.string().min(1).max(12).optional(),
  limit: z.coerce.number().int().min(1).max(env.SEARCH_MAX_SEGMENTS).optional(),
}).strict();

exports.query = asyncHandler(async (req, res) => {
  const b = req.body;
  const answerLanguage = resolveLanguage('answer', { explicit: b.answerLanguage, user: req.user, meeting: null });
  if (!langs.supports(answerLanguage)) throw new AIError('UNSUPPORTED_LANGUAGE');
  const result = await search.search({
    user: req.user, question: b.question, answerLanguage, limit: b.limit,
    filters: { workspaceId: b.workspaceId, meetingIds: b.meetingIds, from: b.dateRange?.from, to: b.dateRange?.to },
  });
  res.json({ success: true, ...result });
});

// Input suggestions ONLY — never answers.
exports.suggestions = (req, res) => res.json({ success: true, suggestions: [
  { language: 'en', questions: ['What decisions did we make about the dashboard?', 'What action items are still open?', 'Who raised concerns about the deadline?', 'What did we discuss about the budget?'] },
  { language: 'hi', questions: ['डैशबोर्ड के बारे में हमने कौन से फैसले लिए?', 'कौन से कार्य अभी बाकी हैं?', 'समय-सीमा को लेकर किसने चिंता जताई?', 'बजट के बारे में क्या चर्चा हुई?'] },
] });
