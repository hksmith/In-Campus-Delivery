import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL, getDevTelegramId } from './api.js';
import { tg } from './telegram.js';

/**
 * One realtime connection for the whole app (opened by AuthProvider after login).
 * Components subscribe with useSocketEvent(); handlers survive reconnects.
 */
let socket = null;
const handlers = new Map(); // event -> Set<fn>

function dispatch(event, payload) {
  handlers.get(event)?.forEach((fn) => fn(payload));
}

export function connectSocket() {
  if (socket) return socket;
  socket = io(API_URL || window.location.origin, {
    auth: { initData: tg?.initData || undefined, devTelegramId: getDevTelegramId() || undefined },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 10000,
  });
  socket.onAny(dispatch);
  socket.on('connect', () => dispatch('socket:connected'));
  // The server disconnects us when our role changes – reconnect to join the right rooms
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') setTimeout(() => socket?.connect(), 500);
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

/** Subscribe to a socket event for the lifetime of the component */
export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (payload) => ref.current?.(payload);
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event).add(fn);
    return () => handlers.get(event)?.delete(fn);
  }, [event]);
}
