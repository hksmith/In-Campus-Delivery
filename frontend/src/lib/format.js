import { t } from '../i18n/index.js';

let currency = 'ETB';
export const setCurrency = (c) => {
  if (c) currency = c;
};

export const money = (n) =>
  `${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;

export function timeAgo(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return t('time.justNow');
  const m = Math.floor(s / 60);
  if (m < 60) return t('time.minAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('time.hAgo', { n: h });
  const d = Math.floor(h / 24);
  return d === 1 ? t('time.yesterday') : t('time.daysAgo', { n: d });
}

export const time = (date) =>
  date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

export const dateTime = (date) =>
  date
    ? new Date(date).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

export const minutesUntil = (date) => (date ? Math.round((new Date(date).getTime() - Date.now()) / 60000) : null);

export const personName = (u) => u?.fullName || u?.firstName || (u?.username ? `@${u.username}` : '—');
