/** Thin wrapper around Socket.io so controllers can emit without importing the server */
let io = null;

export const setIO = (server) => {
  io = server;
};

export const rooms = {
  user: (id) => `user:${id}`,
  cafe: (id) => `cafe:${id}`,
  drivers: 'drivers',
  admins: 'admins',
};

export function emitTo(room, event, payload) {
  if (io) io.to(room).emit(event, payload);
}

/** Tell a user's open app to reload their profile (role changed, approved, banned…) */
export function emitUserRefresh(userId) {
  emitTo(rooms.user(userId), 'me:updated', {});
}

/** Disconnect a user's sockets so they reconnect and join the rooms for their new role */
export async function resyncUserSockets(userId) {
  if (!io) return;
  const sockets = await io.in(rooms.user(userId)).fetchSockets();
  sockets.forEach((s) => s.disconnect(true));
}
