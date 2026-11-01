// Language precedence (documented in README + Settings page):
//   explicit request param -> meeting setting -> requesting user's preference -> meeting primaryLanguage -> 'en'
// One user's preference never affects another user: only the REQUESTING user's prefs are consulted.
const KEYS = {
  transcript: { meeting: 'transcriptLanguage', user: 'transcriptLanguage' },
  summary: { meeting: 'summaryLanguage', user: 'summaryLanguage' },
  answer: { meeting: null, user: 'searchAnswerLanguage' },
};
exports.resolveLanguage = (kind, { explicit, meeting, user } = {}) => {
  const k = KEYS[kind];
  return explicit
    || (k.meeting && meeting?.languageSettings?.[k.meeting])
    || user?.languagePreferences?.[k.user]
    || meeting?.languageSettings?.primaryLanguage
    || 'en';
};
