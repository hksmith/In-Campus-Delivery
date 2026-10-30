import { openContact } from './contact.js';
import { useEffect } from 'react';

/** Telegram WebApp object (undefined when opened in a normal browser) */
export const tg = window.Telegram?.WebApp;

/** True only when really running inside Telegram (initData is signed by Telegram) */
export const isInTelegram = Boolean(tg?.initData);

const versionAtLeast = (v) => Boolean(tg?.isVersionAtLeast?.(v));

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    if (versionAtLeast('7.7')) tg.disableVerticalSwipes();
    if (versionAtLeast('6.1')) {
      tg.setHeaderColor('secondary_bg_color');
      tg.setBackgroundColor('secondary_bg_color');
    }
  } catch {
    /* older clients */
  }
}

export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred?.('light'),
  success: () => tg?.HapticFeedback?.notificationOccurred?.('success'),
  error: () => tg?.HapticFeedback?.notificationOccurred?.('error'),
  warning: () => tg?.HapticFeedback?.notificationOccurred?.('warning'),
};

/** Native Telegram confirm dialog with browser fallback */
export function confirmDialog(message) {
  return new Promise((resolve) => {
    if (isInTelegram && versionAtLeast('6.2')) tg.showConfirm(message, (ok) => resolve(Boolean(ok)));
    else resolve(window.confirm(message));
  });
}

/** Telegram has no native text prompt – we use our own sheet (see lib/dialog.js) */
export { promptDialog } from './dialog.js';

export function openTelegramUser(username) {
  if (!username) return;
  const url = `https://t.me/${username.replace(/^@/, '')}`;
  if (isInTelegram) tg.openTelegramLink(url);
  else window.open(url, '_blank');
}

/**
 * Opens the contact menu for a phone number: Message on Telegram / Copy number.
 * Pass { username, name } when known so "Message on Telegram" appears too.
 */
export function callPhone(phone, { username, name } = {}) {
  openContact({ phone, username, name });
}

/** Ask Telegram to share the user's phone number. Resolves to the number or null. */
export function requestPhone() {
  return new Promise((resolve) => {
    if (!isInTelegram || !versionAtLeast('6.9')) return resolve(null);
    tg.requestContact((ok, result) => {
      const phone = ok ? result?.responseUnsafe?.contact?.phone_number : null;
      resolve(phone ? (phone.startsWith('+') ? phone : `+${phone}`) : null);
    });
  });
}

/** Lets the bot message users who opened the app from a link without pressing /start */
export function requestWriteAccess() {
  if (!isInTelegram || !versionAtLeast('6.9')) return;
  try {
    tg.requestWriteAccess(() => {});
  } catch {
    /* ignore */
  }
}

/** Shows Telegram's native back button while the component is mounted */
export function useBackButton(onBack, enabled = true) {
  useEffect(() => {
    const btn = tg?.BackButton;
    if (!btn || !enabled) return undefined;
    btn.show();
    btn.onClick(onBack);
    return () => {
      btn.offClick(onBack);
      btn.hide();
    };
  }, [onBack, enabled]);
}
