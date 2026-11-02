// Labels and helpers for the Security tab (pure, unit tested).
export const EVENT_LABELS = {
  login_success: 'Signed in',
  login_failed: 'Failed sign-in attempt',
  account_locked: 'Sign-in locked after too many failed attempts',
  password_changed: 'Password changed',
  password_change_failed: 'Failed password change (wrong current password)',
  sessions_revoked: 'Logged out of all devices',
  email_changed: 'Email changed',
};
export const isSuspicious = (type) => ['login_failed', 'account_locked', 'password_change_failed'].includes(type);
export const eventLabel = (type) => EVENT_LABELS[type] || type;

// "Chrome on Windows" from a user-agent string; falls back to a short piece of the raw text.
export const deviceLabel = (ua = '') => {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || ua.slice(0, 40);
};