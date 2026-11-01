import { api } from './api';
export const register = (body) => api.post('/auth/register', body).then((r) => r.data.user);
export const login = (body) => api.post('/auth/login', body).then((r) => r.data.user);
export const logout = () => api.post('/auth/logout').then((r) => r.data);
export const me = () => api.get('/auth/me').then((r) => r.data.user);
