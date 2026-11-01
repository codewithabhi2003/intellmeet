import { api } from './api';
export const query = (body) => api.post('/meeting-search/query', body).then((r) => r.data);
export const suggestions = () => api.get('/meeting-search/suggestions').then((r) => r.data.suggestions);
