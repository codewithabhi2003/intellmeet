import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const langs = require('../services/ai/languages');
const { resolveLanguage } = require('../utils/languagePrefs');

describe('languages + precedence (no DB)', () => {
  it('registry only exposes verified languages; Whisper names normalize to codes', () => {
    expect(langs.list().map((l) => l.code)).toEqual(['en', 'hi']);
    expect(langs.normalize('hindi')).toBe('hi'); expect(langs.normalize('English')).toBe('en');
    expect(langs.supports('xx', 'transcription')).toBe(false);
  });
  it('precedence: explicit > meeting > user > primary > en', () => {
    const meeting = { languageSettings: { primaryLanguage: 'hi', summaryLanguage: 'en' } };
    const user = { languagePreferences: { summaryLanguage: 'hi' } };
    expect(resolveLanguage('summary', { explicit: 'hi', meeting, user })).toBe('hi');
    expect(resolveLanguage('summary', { meeting, user })).toBe('en');
    expect(resolveLanguage('summary', { meeting: { languageSettings: { primaryLanguage: 'hi' } }, user })).toBe('hi');
    expect(resolveLanguage('summary', { meeting: { languageSettings: { primaryLanguage: 'hi' } }, user: {} })).toBe('hi');
    expect(resolveLanguage('answer', { meeting: {}, user: {} })).toBe('en');
  });
});
