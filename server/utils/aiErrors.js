const MAP = {
  RATE_LIMITED: [429, 'The AI provider is rate limiting requests. Please try again shortly.'],
  PROVIDER_ERROR: [502, 'The AI provider returned an error. Please try again.'],
  UNSUPPORTED_LANGUAGE: [400, 'That language is not supported.'],
  AUDIO_TOO_LARGE: [413, 'The audio file is too large.'],
  FEATURE_NOT_CONFIGURED: [503, 'This feature needs an API key to be configured.'],
};
class AIError extends Error {
  constructor(code = 'PROVIDER_ERROR') {
    super(code); this.code = code;
    [this.status, this.safeMessage] = MAP[code] || MAP.PROVIDER_ERROR;
  }
}
module.exports = { AIError };
