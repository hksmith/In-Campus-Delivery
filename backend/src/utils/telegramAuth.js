import crypto from 'node:crypto';
import { ApiError } from './ApiError.js';

/**
 * Validates the `initData` string that Telegram gives a Mini App.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Never trust a user id sent by the client – always validate initData on the server.
 */
export function validateInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || typeof initData !== 'string') throw ApiError.unauthorized('Missing Telegram init data');
  if (!botToken) throw ApiError.unauthorized('Server bot token not configured');

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw ApiError.unauthorized('Invalid Telegram init data');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw ApiError.unauthorized('Telegram data signature is invalid');
  }

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) {
    throw ApiError.unauthorized('Telegram session expired, please reopen the app');
  }

  let user;
  try {
    user = JSON.parse(params.get('user'));
  } catch {
    throw ApiError.unauthorized('Invalid Telegram user');
  }
  if (!user?.id) throw ApiError.unauthorized('Invalid Telegram user');

  return { user, authDate, startParam: params.get('start_param') || null };
}

/** Builds a valid initData string – used only by tests/scripts */
export function signInitData(fields, botToken) {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

/** Reads the Telegram user id from initData WITHOUT validating (only for rate-limit bucketing) */
export function peekTelegramId(initData) {
  try {
    return JSON.parse(new URLSearchParams(initData).get('user'))?.id ?? null;
  } catch {
    return null;
  }
}
