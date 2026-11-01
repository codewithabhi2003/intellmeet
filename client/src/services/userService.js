import { api } from './api';
export const updateMe = (body) => api.put('/users/me', body).then((r) => r.data.user);
export const uploadAvatar = (file) => { const fd = new FormData(); fd.append('avatar', file); return api.post('/users/me/avatar', fd).then((r) => r.data.user); };
export const removeAvatar = () => api.delete('/users/me/avatar').then((r) => r.data.user);
export const getLanguagePreferences = () => api.get('/users/me/language-preferences').then((r) => r.data.languagePreferences);
export const putLanguagePreferences = (body) => api.put('/users/me/language-preferences', body).then((r) => r.data.languagePreferences);
