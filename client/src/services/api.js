import axios from 'axios';

// Auth is an httpOnly cookie (set by the server), so no token ever touches JS-accessible storage.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
  timeout: 60000,
});

api.interceptors.response.use((r) => r, (err) => {
  const url = err.config?.url || '';
  if (err.response?.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('intellmeet:unauthorized'));
  return Promise.reject(err);
});

export const errorMessage = (err, fallback = 'Something went wrong. Please try again.') =>
  err?.response?.data?.message || (err?.code === 'ERR_NETWORK' ? 'Cannot reach the server. Is it running?' : fallback);
export const errorCode = (err) => err?.response?.data?.code || null;
