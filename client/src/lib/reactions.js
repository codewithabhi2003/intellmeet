// Pure helpers for meeting reactions (unit tested).
// The emoji list must match the server's allow-list (server/sockets/reactions.js): nothing else is ever sent or shown.
export const REACTIONS = [
  { emoji: '👍', label: 'Thumbs up' }, { emoji: '👏', label: 'Applause' }, { emoji: '❤️', label: 'Heart' }, { emoji: '😂', label: 'Laughing' },
  { emoji: '😮', label: 'Surprised' }, { emoji: '🎉', label: 'Celebration' }, { emoji: '🙏', label: 'Thanks' }, { emoji: '🔥', label: 'Fire' },
];
export const MAX_FLOATING = 24;          // emojis on screen at once; older ones are dropped
export const SEND_COOLDOWN_MS = 500;     // keeps a normal user under the server's 8 per 4 seconds

export const isKnownEmoji = (e) => REACTIONS.some((r) => r.emoji === e);
export const labelFor = (emoji) => REACTIONS.find((r) => r.emoji === emoji)?.label || 'a reaction';
export const laneFor = (rnd = Math.random) => Math.round(8 + rnd() * 84);                 // 8-92 % from the left edge
export const wobbleFor = (rnd = Math.random) => Math.round((rnd() - 0.5) * 80);           // sideways drift in px, -40..40
export const durationFor = (rnd = Math.random) => Math.round((2.8 + rnd() * 1.2) * 100) / 100;   // 2.8-4.0 s
export const addFloating = (list, item, max = MAX_FLOATING) => (list.some((x) => x.id === item.id) ? list : [...list, item].slice(-max));
