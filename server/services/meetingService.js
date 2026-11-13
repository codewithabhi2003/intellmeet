// server/services/meetingService.js
const Meeting = require('../models/Meeting');

// Marks a user as present. Only the host may start a scheduled meeting.
exports.markJoined = async (meeting, userId) => {
  // Update by array index instead of MongoDB's positional "$" operator: same result, and it also works on Mongo-compatible
  // databases that do not implement "$". Participants are only ever appended, so an index read just now stays valid.
  const i = meeting.participants.findIndex((p) => p.userId && p.userId.equals(userId));
  if (i >= 0) await Meeting.updateOne({ _id: meeting._id }, { $set: { [`participants.${i}.leftAt`]: null } });
  else await Meeting.updateOne({ _id: meeting._id }, { $push: { participants: { userId, joinedAt: new Date(), leftAt: null } } });
  if (meeting.status === 'scheduled' && meeting.hostId.equals(userId))
    await Meeting.updateOne({ _id: meeting._id, status: 'scheduled' }, { $set: { status: 'live', startedAt: new Date() } });
};
exports.markLeft = async (meetingId, userId) => {
  const m = await Meeting.findById(meetingId).select('participants');
  const i = m ? m.participants.findIndex((p) => p.userId && p.userId.equals(userId)) : -1;
  if (i >= 0) await Meeting.updateOne({ _id: meetingId }, { $set: { [`participants.${i}.leftAt`]: new Date() } });
};

// Cascade for soft delete: derived AI data is removed (models are registered lazily by later phases).
const CASCADE = ['TranscriptSegment', 'Translation', 'Summary', 'Transcript'];
exports.cascadeDelete = async (meetingId) => {
  const mongoose = require('mongoose');
  for (const name of CASCADE) if (mongoose.models[name]) await mongoose.models[name].deleteMany({ meetingId });
};

exports.canJoin = (meeting, userId) => {
  if ((meeting.removedUserIds || []).some((i) => i.equals(userId))) return { ok: false, code: 'REMOVED', message: 'You were removed from this meeting by the host.' };
  if (['ended', 'cancelled'].includes(meeting.status)) return { ok: false, code: 'MEETING_CLOSED', message: 'This meeting has ended.' };
  if (meeting.status === 'scheduled' && !meeting.hostId.equals(userId)) return { ok: false, code: 'NOT_STARTED', message: 'The host has not started this meeting yet.' };
  return { ok: true };
};

// ---- WebRTC ICE servers (STUN + TURN) --------------------------------------------------------------------------------
// TURN relays media for people whose network blocks a direct connection (mobile data, office/college Wi-Fi). Without it those
// people see frozen or black video. Providers are tried in this order, the first that returns servers wins:
//   1. Cloudflare Realtime TURN  CF_TURN_KEY_ID + CF_TURN_API_TOKEN   (short-lived credentials, generated here)
//   2. Metered / Open Relay      METERED_APP + METERED_API_KEY        (free account; credentials fetched here)
//   3. Static credentials        TURN_URL (one URL, or a comma-separated list) + TURN_USERNAME + TURN_CREDENTIAL
// With only STUN_URLS / TURN_URL set (and nothing for 1 and 2) the result is identical to the old handler in meetingController.
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const ICE_CACHE_MS = 60 * 60 * 1000;          // credentials fetched from a provider are valid for 24 h, so a 1 h cache is always safe
const CF_TTL_S = 24 * 60 * 60;
let remoteCache = { at: 0, turn: null };      // only provider (network) results are cached; the static .env settings are read on every request
let warned = false;

async function fromCloudflare() {
  const { CF_TURN_KEY_ID: id, CF_TURN_API_TOKEN: token } = process.env;
  if (!id || !token) return null;
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: CF_TTL_S }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const { iceServers } = await r.json();
  const servers = Array.isArray(iceServers) ? iceServers : [iceServers];
  // browsers block port 53, so those URLs only slow ICE gathering down
  return servers.filter(Boolean).map((s) => ({ ...s, urls: list([].concat(s.urls).join(',')).filter((u) => !/:53(\?|$)/.test(u)) })).filter((s) => s.urls.length);
}

async function fromMetered() {
  const { METERED_APP: app, METERED_API_KEY: key } = process.env;
  if (!app || !key) return null;
  const r = await fetch(`https://${app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function fromEnv() {
  const urls = list(process.env.TURN_URL);
  if (!urls.length) return [];
  // a single URL stays a plain string, exactly as before; several URLs (e.g. UDP 80 + TLS 443) go out as a list
  return [{ urls: urls.length === 1 ? urls[0] : urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }];
}

const attempt = async (fn) => {
  try { const s = await fn(); return s && s.length ? s : null; }
  catch (e) { console.warn(`[rtc-config] ${fn.name} failed: ${e.message}`); return null; }
};

// Returns the iceServers array the browser passes to RTCPeerConnection (used by meetingController.rtcConfig).
// STUN is listed only when STUN_URLS is set, as before; the browser side falls back to public STUN when the list comes back empty.
exports.rtcConfig = async () => {
  const stun = list(process.env.STUN_URLS);
  let turn = remoteCache.turn && Date.now() - remoteCache.at < ICE_CACHE_MS ? remoteCache.turn : null;
  if (!turn) {
    turn = (await attempt(fromCloudflare)) || (await attempt(fromMetered));
    if (turn) remoteCache = { at: Date.now(), turn };
  }
  const servers = [...(stun.length ? [{ urls: stun }] : []), ...(turn || fromEnv())];
  if (!warned && !servers.some((s) => [].concat(s.urls).some((u) => /^turns?:/.test(u)))) {
    warned = true;
    console.warn('[rtc-config] no TURN server configured: people on restrictive networks will not get video.');
  }
  return servers;
};