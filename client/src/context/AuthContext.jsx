import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    authService.me().then((u) => alive && setUser(u)).catch(() => {}).finally(() => alive && setLoading(false));
    const onUnauthorized = () => setUser(null);
    window.addEventListener('intellmeet:unauthorized', onUnauthorized);
    return () => { alive = false; window.removeEventListener('intellmeet:unauthorized', onUnauthorized); };
  }, []);

  const login = useCallback(async (body) => { const u = await authService.login(body); setUser(u); return u; }, []);
  const register = useCallback(async (body) => { const u = await authService.register(body); setUser(u); return u; }, []);
  const logout = useCallback(async () => { try { await authService.logout(); } finally { setUser(null); } }, []);
  const value = useMemo(() => ({ user, loading, login, register, logout, setUser }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
