import { api } from './api';
export const list = (params) => api.get('/tasks', { params }).then((r) => r.data.tasks);
export const create = (body) => api.post('/tasks', body).then((r) => r.data.task);
export const update = (id, body) => api.patch(`/tasks/${id}`, body).then((r) => r.data.task);
export const remove = (id) => api.delete(`/tasks/${id}`).then((r) => r.data);
