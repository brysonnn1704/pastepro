import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@clipper/shared';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocket(auth?: { sessionId?: string; deviceToken?: string; role?: 'pc' | 'phone' }): TypedSocket {
  const url = import.meta.env.VITE_API_URL || window.location.origin;
  
  return io(url, {
    auth: auth || {},
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
