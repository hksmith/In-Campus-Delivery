import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { ah } from '../utils/helpers.js';
import { validateInitData } from '../utils/telegramAuth.js';
import { findOrCreateUser } from '../services/userService.js';

/**
 * Resolves the Telegram user from a request.
 * Production: header  "Authorization: tma <initData>"
 * Development (DEV_AUTH_BYPASS=true): header "x-dev-telegram-id: 1000001"
 */
export function telegramUserFromCredentials({ authorization, devTelegramId }) {
  if (authorization && authorization.startsWith('tma ')) {
    return validateInitData(authorization.slice(4), env.TELEGRAM_BOT_TOKEN, env.INIT_DATA_MAX_AGE_SECONDS).user;
  }
  if (env.DEV_AUTH_BYPASS && devTelegramId) {
    const id = Number(devTelegramId);
    if (!Number.isFinite(id)) throw ApiError.unauthorized('Invalid dev telegram id');
    return { id }; // name/username are left as they are in the database
  }
  throw ApiError.unauthorized('Please open this app from Telegram');
}

export const authenticate = ah(async (req, res, next) => {
  const tgUser = telegramUserFromCredentials({
    authorization: req.headers.authorization,
    devTelegramId: req.headers['x-dev-telegram-id'],
  });
  const user = await findOrCreateUser(tgUser);
  if (user.isBanned) {
    throw new ApiError(403, `Your account is suspended${user.banReason ? `: ${user.banReason}` : ''}`, {
      code: 'BANNED',
    });
  }
  req.user = user;
  next();
});

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };

export const requireProfile = (req, res, next) => {
  if (!req.user?.isProfileComplete) {
    return next(new ApiError(400, 'Please complete your profile first', { code: 'PROFILE_INCOMPLETE' }));
  }
  next();
};

/** Driver must be approved (suspended drivers can still log in but not deliver) */
export const requireActiveDriver = (req, res, next) => {
  if (req.user?.role !== 'driver') return next(ApiError.forbidden('Drivers only'));
  if (req.user.driverProfile?.status !== 'approved') {
    return next(ApiError.forbidden('Your driver account is not active. Contact the admin.'));
  }
  next();
};
