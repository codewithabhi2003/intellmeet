import { api } from './api';
export const list = (params) => api.get('/meetings', { params }).then((r) => r.data);
export const create = (body) => api.post('/meetings', body).then((r) => r.data);
export const join = (roomCode) => api.post('/meetings/join', { roomCode }).then((r) => r.data.meeting);
export const get = (id) => api.get(`/meetings/${id}`).then((r) => r.data.meeting);
export const patch = (id, body) => api.patch(`/meetings/${id}`, body).then((r) => r.data.meeting);
export const remove = (id) => api.delete(`/meetings/${id}`).then((r) => r.data);
export const end = (id) => api.post(`/meetings/${id}/end`).then((r) => r.data.meeting);
export const messages = (id, params) => api.get(`/meetings/${id}/messages`, { params }).then((r) => r.data.messages);
export const consent = (id) => api.post(`/meetings/${id}/consent`).then((r) => r.data);
export const rtcConfig = () => api.get('/meetings/rtc-config').then((r) => r.data.iceServers);
export const uploadRecording = (id, blob, durationSec, filename) => {
  const fd = new FormData();
  fd.append('audio', blob, filename);
  if (durationSec) fd.append('durationSec', String(Math.round(durationSec)));
  return api.post(`/meetings/${id}/recording`, fd, { timeout: 300000 }).then((r) => r.data.recording);
};
