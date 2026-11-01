import { api } from './api';
export const status = () => api.get('/ai/status').then((r) => r.data.features);
export const languages = () => api.get('/languages').then((r) => r.data.languages);
