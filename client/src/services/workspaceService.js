import { api } from './api';
export const list = () => api.get('/workspaces').then((r) => r.data.workspaces);
export const create = (name) => api.post('/workspaces', { name }).then((r) => r.data.workspace);
export const addMember = (id, body) => api.post(`/workspaces/${id}/members`, body).then((r) => r.data.workspace);
export const removeMember = (id, userId) => api.delete(`/workspaces/${id}/members/${userId}`).then((r) => r.data.workspace);
