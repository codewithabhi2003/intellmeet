// Verified against ai.google.dev: @google/genai -> ai.models.generateContent / ai.models.embedContent
// (gemini-embedding-001 supports taskType + outputDimensionality).
const { GoogleGenAI } = require('@google/genai');
const { env } = require('../../../config/aiConfig');
const { AIError } = require('../../../utils/aiErrors');

let client;
const get = () => (client ||= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }));
const isRate = (e) => e?.status === 429 || e?.code === 429 || /RESOURCE_EXHAUSTED|429/.test(String(e?.message || ''));

const withTimeout = (p) => {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('timeout'), { status: 504 })), env.AI_REQUEST_TIMEOUT_MS); })])
    .finally(() => clearTimeout(t));
};
const parseJSON = (t) => JSON.parse(String(t || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));

// Returns zod-validated JSON. `retry` = extra attempts for transport/parse/validation errors (never for 429).
exports.generateJSON = async ({ system, user, schema, retry = 0 }) => {
  let last;
  for (let i = 0; i <= retry; i++) {
    try {
      const r = await withTimeout(get().models.generateContent({
        model: env.LANGUAGE_MODEL, contents: user,
        config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 0 },
      }));
      return schema.parse(parseJSON(r.text));
    } catch (e) {
      last = e;
      if (isRate(e)) break;
    }
  }
  console.error('[gemini]', last?.status || '', last?.name);   // never log prompts, transcripts or keys
  throw new AIError(isRate(last) ? 'RATE_LIMITED' : 'PROVIDER_ERROR');
};

const normalize = (v) => { const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; return v.map((x) => x / n); };
// taskType: RETRIEVAL_DOCUMENT for segments, RETRIEVAL_QUERY for questions. Truncated dims are L2-normalized.
exports.embed = async (texts, taskType = 'RETRIEVAL_DOCUMENT') => {
  try {
    const r = await withTimeout(get().models.embedContent({
      model: env.EMBEDDING_MODEL, contents: texts, config: { taskType, outputDimensionality: env.EMBEDDING_DIMENSIONS },
    }));
    const out = (r.embeddings || []).map((e) => normalize(e.values));
    if (out.length !== texts.length) throw new Error('embedding count mismatch');
    return out;
  } catch (e) {
    console.error('[gemini-embed]', e?.status || '', e?.name);
    throw new AIError(isRate(e) ? 'RATE_LIMITED' : 'PROVIDER_ERROR');
  }
};
