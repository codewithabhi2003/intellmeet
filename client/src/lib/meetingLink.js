// Meeting link + code helpers (unit tested).
// The code is made in the browser BEFORE the meeting exists, so the link can be copied and shared while the meeting is still being set up.
// It has the same shape as the server's own codes: 12 URL-safe characters from 72 random bits.
export const ROOM_CODE_RE = /^[A-Za-z0-9_-]{12}$/;
export const isRoomCode = (c) => ROOM_CODE_RE.test(String(c || ''));
export const generateRoomCode = () => {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const meetingLink = (code) => `${window.location.origin}/room/${code}`;
export const copyText = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };