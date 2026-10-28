import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { corsOrigin } from '../app.js';
import { telegramUserFromCredentials } from '../middleware/auth.js';
import { findOrCreateUser } from '../services/userService.js';
import { rooms, setIO } from '../services/realtime.js';

/**
 * Realtime updates. Each socket joins rooms based on the user's role:
 *   user:<id>   – everyone (their own orders)
 *   cafe:<id>   – cafe owner + staff (new orders)
 *   drivers     – approved drivers (available orders)
 *   admins      – admins (everything)
 */
export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin },
    pingInterval: 25000,
  });

  io.use(async (socket, next) => {
    try {
      const { initData, devTelegramId } = socket.handshake.auth || {};
      const tgUser = telegramUserFromCredentials({
        authorization: initData ? `tma ${initData}` : undefined,
        devTelegramId,
      });
      const user = await findOrCreateUser(tgUser);
      if (user.isBanned) return next(new Error('banned'));
      socket.data.user = user;
      next();
    } catch (err) {
      next(new Error(err.message || 'unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(rooms.user(user._id));
    if (['cafe_owner', 'cafe_staff'].includes(user.role) && user.cafe) socket.join(rooms.cafe(user.cafe));
    if (user.role === 'driver' && user.driverProfile?.status === 'approved') socket.join(rooms.drivers);
    if (user.role === 'admin') socket.join(rooms.admins);
    if (!env.isProd) console.log(`🔌 socket connected: ${user.displayName} (${user.role})`);
  });

  setIO(io);
  return io;
}
