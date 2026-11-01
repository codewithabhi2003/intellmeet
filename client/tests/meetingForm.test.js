import { describe, it, expect } from 'vitest';
import { toLanguageSettings, parseEmails, isEmail, buildCreatePayload, gridColumns, localInputToISO, DEFAULT_LANGUAGE_SETTINGS } from '../src/lib/meetingForm';
import { pickMime, extFor } from '../src/hooks/useRecorder';

describe('create-meeting payload', () => {
  it('empty language selects become null so the server falls back to preferences', () => {
    expect(toLanguageSettings({ ...DEFAULT_LANGUAGE_SETTINGS, primaryLanguage: 'hi', autoDetect: true })).toEqual({ primaryLanguage: 'hi', autoDetect: true, transcriptLanguage: null, summaryLanguage: null });
    expect(toLanguageSettings({ primaryLanguage: 'en', autoDetect: false, transcriptLanguage: 'hi', summaryLanguage: 'en' })).toMatchObject({ transcriptLanguage: 'hi', summaryLanguage: 'en' });
  });
  it('instant vs scheduled, trimmed title, optional fields omitted', () => {
    const base = { title: '  Sync  ', description: ' ', workspaceId: 'w1', emails: [], languageSettings: DEFAULT_LANGUAGE_SETTINGS };
    const now = buildCreatePayload({ ...base, mode: 'now' });
    expect(now).toMatchObject({ title: 'Sync', instant: true, workspaceId: 'w1' }); expect(now.scheduledAt).toBeUndefined(); expect(now.description).toBeUndefined(); expect(now.invitedEmails).toBeUndefined();
    const later = buildCreatePayload({ ...base, mode: 'later', scheduledAt: '2030-01-02T10:30', emails: ['a@b.dev'] });
    expect(later.instant).toBeUndefined(); expect(later.scheduledAt).toBe(new Date('2030-01-02T10:30').toISOString()); expect(later.invitedEmails).toEqual(['a@b.dev']);
  });
  it('parses, lowercases and de-duplicates emails; validates', () => {
    expect(parseEmails('A@x.dev, b@x.dev;a@x.dev  c@x.dev')).toEqual(['a@x.dev', 'b@x.dev', 'c@x.dev']);
    expect(isEmail('a@b.dev')).toBe(true); expect(isEmail('nope')).toBe(false); expect(localInputToISO('garbage')).toBeNull();
  });
});

describe('layout + recorder helpers', () => {
  it('adaptive columns', () => { expect([1, 2, 4, 5, 6].map(gridColumns)).toEqual([1, 2, 2, 3, 3]); });
  it('picks the first supported recording mime, and a matching file extension', () => {
    expect(pickMime((m) => m === 'audio/webm')).toBe('audio/webm'); expect(pickMime(() => false)).toBe('');
    expect(extFor('audio/webm;codecs=opus')).toBe('webm'); expect(extFor('audio/ogg')).toBe('ogg'); expect(extFor('audio/mp4')).toBe('m4a');
  });
});
