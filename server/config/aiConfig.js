const { z } = require('zod');
const num = (d) => z.coerce.number().default(d);
const blank = (v) => (v === '' ? undefined : v);
const env = z.object({
  GROQ_API_KEY: z.preprocess(blank, z.string().optional()),
  GEMINI_API_KEY: z.preprocess(blank, z.string().optional()),
  TRANSCRIPTION_MODEL: z.string().default('whisper-large-v3-turbo'),
  LANGUAGE_MODEL: z.string().default('gemini-2.5-flash'),
  EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
  EMBEDDING_DIMENSIONS: num(768), MAX_UPLOAD_MB: num(200), MAX_AVATAR_MB: num(2), MAX_AUDIO_MB: num(25), MAX_AUDIO_MINUTES: num(180),
  SEARCH_MAX_QUERY_CHARS: num(500), SEARCH_MAX_SEGMENTS: num(12), SEARCH_MAX_CONTEXT_CHARS: num(12000),
  SEARCH_VECTOR_CANDIDATES: num(3000), SEARCH_MIN_SIMILARITY: num(0.55), ATLAS_VECTOR_INDEX: z.preprocess(blank, z.string().optional()),
  AI_RATE_LIMIT_PER_MIN: num(20), AI_REQUEST_TIMEOUT_MS: num(60000),
}).parse(process.env);

// Placeholder values from .env.example count as "not set".
const real = (k) => !!k && !/^your_/i.test(k);
const features = {
  transcription: real(env.GROQ_API_KEY),
  language: real(env.GEMINI_API_KEY),
  search: real(env.GEMINI_API_KEY),
};
const requireFeature = (f) => (req, res, next) => features[f] ? next()
  : res.status(503).json({ success: false, code: 'FEATURE_NOT_CONFIGURED', message: 'This feature needs an API key to be configured.' });

const banner = () => {
  const l = (ok, label, off) => (ok ? `✅ ${label}` : `⚠️ ${off}`);
  console.log([
    l(features.transcription, 'Transcription', 'Transcription disabled — GROQ_API_KEY missing'),
    l(features.language, 'Translation + Summary', 'Translation/Summary disabled — GEMINI_API_KEY missing'),
    l(features.search, 'Search answers', 'Search answers disabled (keyword-only) — GEMINI_API_KEY missing'),
  ].join('\n'));
};
module.exports = { env, features, requireFeature, banner };
