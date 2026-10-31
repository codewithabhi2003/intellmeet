// Verified against console.groq.com/docs/speech-to-text: groq.audio.transcriptions.create, verbose_json returns
// segments, language optional (omit -> auto-detect), upload limit 25MB. timestamp_granularities is NOT passed:
// verbose_json already returns segment timestamps and the docs flag the parameter as unsupported in places.
const fs = require('fs');
const Groq = require('groq-sdk');
const { env } = require('../../../config/aiConfig');
const { AIError } = require('../../../utils/aiErrors');

let client;
const get = () => (client ||= new Groq({ apiKey: env.GROQ_API_KEY, timeout: Math.max(env.AI_REQUEST_TIMEOUT_MS, 120000), maxRetries: 0 }));

exports.transcribe = async ({ filePath, language }) => {
  try {
    const r = await get().audio.transcriptions.create({
      file: fs.createReadStream(filePath), model: env.TRANSCRIPTION_MODEL,
      response_format: 'verbose_json', temperature: 0,
      ...(language ? { language } : {}),                       // omit -> auto-detect
    });
    return {
      language: r.language, durationSec: r.duration,
      segments: (r.segments || []).map((s) => ({ start: s.start, end: s.end, text: String(s.text || '').trim() })),
    };
  } catch (e) {
    console.error('[groq]', e.status || '', e.name);          // detail stays server-side, never the audio/transcript
    throw new AIError(e.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR');
  }
};
