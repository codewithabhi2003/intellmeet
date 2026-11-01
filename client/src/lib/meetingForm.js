// Pure helpers (unit tested).
export const DEFAULT_LANGUAGE_SETTINGS = { primaryLanguage: 'en', autoDetect: false, transcriptLanguage: '', summaryLanguage: '' };

// Empty selects mean "not set": the server then falls back to the user's preference, then the primary language.
export const toLanguageSettings = (v) => ({
  primaryLanguage: v.primaryLanguage || 'en',
  autoDetect: !!v.autoDetect,
  transcriptLanguage: v.transcriptLanguage || null,
  summaryLanguage: v.summaryLanguage || null,
});

export const parseEmails = (text) => [...new Set(String(text || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// <input type="datetime-local"> gives local time without a zone; the API wants an ISO instant.
export const localInputToISO = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

export const buildCreatePayload = ({ title, description, mode, scheduledAt, workspaceId, emails, languageSettings, roomCode, waitingRoom }) => {
  const p = { title: title.trim(), languageSettings: toLanguageSettings(languageSettings) };
  if (description?.trim()) p.description = description.trim();
  if (workspaceId) p.workspaceId = workspaceId;
  if (emails.length) p.invitedEmails = emails;
  if (roomCode) p.roomCode = roomCode;                 // the code shown in the form is the one the meeting gets
  if (waitingRoom) p.waitingRoom = true;
  if (mode === 'now') p.instant = true; else p.scheduledAt = localInputToISO(scheduledAt);
  return p;
};

// Adaptive video layout: columns for n tiles (mobile is always 1-2 columns via the class map in VideoGrid).
export const gridColumns = (n) => (n <= 1 ? 1 : n <= 4 ? 2 : 3);

export const formatWhen = (m) => {
  const d = m.startedAt || m.scheduledAt || m.createdAt;
  return d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
};