import { createContext, useCallback, useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';

export const SocketContext = createContext(null);

// One lazily-created socket per signed-in user. The httpOnly cookie authenticates the handshake.
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const ref = useRef(null);
  const disconnect = useCallback(() => { ref.current?.disconnect(); ref.current = null; }, []);
  const getSocket = useCallback(() => {
    if (!ref.current) {
      ref.current = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
        withCredentials: true,
        transports: ['websocket'],
        reconnectionDelay: 500,        // after a drop, try again after 0.5 s (Socket.IO default: 1 s) ...
        reconnectionDelayMax: 3000,    // ... and never wait more than 3 s between tries (default: 5 s), so a call comes back sooner
      });
    }
    return ref.current;
  }, []);
  useEffect(() => { if (!user) disconnect(); }, [user, disconnect]);
  useEffect(() => disconnect, [disconnect]);
  const value = useMemo(() => ({ getSocket, disconnect }), [getSocket, disconnect]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}