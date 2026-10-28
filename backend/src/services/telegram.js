import { InlineKeyboard } from 'grammy';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { sleep } from '../utils/helpers.js';
import { tr } from '../i18n/messages.js';

let bot = null;

export const setBot = (instance) => {
  bot = instance;
};
export const getBot = () => bot;

export const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const money = (n) => `${Number(n || 0).toLocaleString('en-US')} ${env.CURRENCY}`;

/** Inline "open the mini app" button. Only works when MINI_APP_URL is https. */
export function appButton(text = 'Open app', path = '/') {
  if (!env.MINI_APP_URL.startsWith('https://')) return undefined;
  return new InlineKeyboard().webApp(text, `${env.MINI_APP_URL}${path}`);
}

/**
 * Button spec: { key: 'btnViewOrder', path } (translated) or { text, path } (literal)
 */
function buildButton(button, lang) {
  if (!button) return undefined;
  const text = button.key ? tr(lang, button.key) : button.text;
  return appButton(text, button.path);
}

/**
 * Sends an HTML message. Never throws – notifications must not break order flows.
 * @param {number} telegramId
 * @param {string} html
 * @param {{ button?: object, lang?: 'en'|'am' }} opts
 */
export async function sendMessage(telegramId, html, opts = {}) {
  if (!bot || !telegramId) return false;
  try {
    await bot.api.sendMessage(telegramId, html, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: buildButton(opts.button, opts.lang || 'en'),
    });
    return true;
  } catch (err) {
    const code = err?.error_code;
    const desc = String(err?.description || '');
    if (code === 403 || (code === 400 && desc.includes('chat not found'))) {
      // user blocked the bot / never started it
      await User.updateOne({ telegramId }, { botBlocked: true }).catch(() => {});
    } else {
      console.error(`Telegram send to ${telegramId} failed:`, err?.description || err?.message);
    }
    return false;
  }
}

/** Sends to one user in their own language. `message` is a string or (lang) => string. */
export function sendTo(user, message, opts = {}) {
  if (!user?.telegramId || user.botBlocked) return Promise.resolve(false);
  const lang = user.language || 'en';
  const html = typeof message === 'function' ? message(lang) : message;
  return sendMessage(user.telegramId, html, { ...opts, lang });
}

/** Send to many users, each in their language, gently (Telegram limit is ~30 msg/sec) */
export async function sendMany(users, message, opts = {}) {
  let sent = 0;
  for (const u of users) {
    if (u?.telegramId && !u.botBlocked) {
      if (await sendTo(u, message, opts)) sent += 1;
      await sleep(40);
    }
  }
  return sent;
}

export async function notifyAdmins(message, opts = {}) {
  const admins = await User.find({ role: 'admin' }).select('telegramId botBlocked language').lean();
  return sendMany(admins, message, opts);
}
