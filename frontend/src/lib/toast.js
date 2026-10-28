import { haptic } from './telegram.js';

/** Tiny global toast store used by <Toaster /> */
const listeners = new Set();
let id = 0;

function push(type, message) {
  const t = { id: ++id, type, message };
  listeners.forEach((l) => l(t));
  if (type === 'error') haptic.error();
  if (type === 'success') haptic.success();
}

export const toast = {
  success: (m) => push('success', m),
  error: (m) => push('error', m),
  info: (m) => push('info', m),
};

export function subscribeToasts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
