import axios from 'axios';
import { tg } from './telegram.js';
import { getLanguage, t } from '../i18n/index.js';

export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Dev login (browser testing without Telegram). Works only when the backend
 * has DEV_AUTH_BYPASS=true. The id can be switched from the Profile page.
 */
export function getDevTelegramId() {
  if (tg?.initData) return null;
  try {
    return localStorage.getItem('devTelegramId') || import.meta.env.VITE_DEV_TELEGRAM_ID || null;
  } catch {
    return import.meta.env.VITE_DEV_TELEGRAM_ID || null;
  }
}

export function setDevTelegramId(id) {
  try {
    if (id) localStorage.setItem('devTelegramId', String(id));
    else localStorage.removeItem('devTelegramId');
  } catch {
    /* ignore */
  }
}

export const api = axios.create({ baseURL: `${API_URL}/api`, timeout: 20000 });

api.interceptors.request.use((config) => {
  config.headers['x-lang'] = getLanguage();
  if (tg?.initData) {
    config.headers.Authorization = `tma ${tg.initData}`;
  } else {
    const devId = getDevTelegramId();
    if (devId) config.headers['x-dev-telegram-id'] = devId;
  }
  return config;
});

/** Human readable error message from an axios error */
export function errorMessage(err) {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === 'ECONNABORTED') return t('err.timeout');
  if (err?.message === 'Network Error') return t('err.network');
  return err?.message || t('err.generic');
}

export async function uploadImage(file) {
  const form = new FormData();
  form.append('image', file);
  const { data } = await api.post('/uploads/image', form, { timeout: 60000 });
  return data.url;
}
