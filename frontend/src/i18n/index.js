import { useSyncExternalStore } from 'react';
import en from './en.js';
import am from './am.js';

/**
 * Tiny translation system.
 *   const t = useT();  t('cart.total')  t('home.hi', { name })
 * The language follows the user's profile (saved on the server) and is
 * remembered in localStorage so the app opens in the right language.
 */
const dictionaries = { en, am };
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'am', label: 'አማርኛ' },
];

function initialLanguage() {
  try {
    const saved = localStorage.getItem('lang');
    if (saved && dictionaries[saved]) return saved;
  } catch {
    /* storage unavailable */
  }
  const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  return tgLang === 'am' ? 'am' : 'en';
}

let current = initialLanguage();
const listeners = new Set();

export const getLanguage = () => current;

export function setLanguage(lang) {
  if (!dictionaries[lang] || lang === current) return;
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem('lang', lang);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** Translate outside React components */
export function t(key, vars) {
  const text = dictionaries[current][key] ?? en[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])));
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hook: re-renders the component when the language changes and returns t() */
export function useT() {
  useSyncExternalStore(subscribe, getLanguage, getLanguage);
  return t;
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

document.documentElement.lang = current;
