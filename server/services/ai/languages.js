// The ONLY language list the UI renders (served by GET /api/languages).
// verified:false -> hidden. Add a language only after confirming it in provider docs AND testing a real sample.
const { z } = require('zod');
const LANGS = [
  { code: 'en', name: 'English', native: 'English', transcription: true, translation: true, verified: true },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', transcription: true, translation: true, verified: true },
];
// Whisper's verbose_json returns full language names ("english"); map back to codes.
const NAME_TO_CODE = Object.fromEntries(LANGS.map((l) => [l.name.toLowerCase(), l.code]));

exports.list = () => LANGS.filter((l) => l.verified);
exports.get = (code) => LANGS.find((l) => l.code === code && l.verified) || null;
exports.supports = (code, cap) => { const l = exports.get(code); return !!l && (!cap || l[cap]); };
exports.nameOf = (code) => exports.get(code)?.name || code;
exports.normalize = (raw) => {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  return NAME_TO_CODE[s] || s.split(/[-_]/)[0];
};
exports.codeSchema = (cap) => z.string().refine((c) => exports.supports(c, cap), 'unsupported language');
