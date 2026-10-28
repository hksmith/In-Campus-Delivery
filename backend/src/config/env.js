import 'dotenv/config';

const list = (value) =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const num = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const NODE_ENV = process.env.NODE_ENV || 'development';

export const env = {
  NODE_ENV,
  isProd: NODE_ENV === 'production',
  PORT: num(process.env.PORT, 5000),

  MONGODB_URI: process.env.MONGODB_URI,

  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  ENABLE_BOT: process.env.ENABLE_BOT !== 'false',
  MINI_APP_URL: (process.env.MINI_APP_URL || '').replace(/\/$/, ''),
  BOT_WEBHOOK_URL: (process.env.BOT_WEBHOOK_URL || '').replace(/\/$/, ''),
  BOT_WEBHOOK_SECRET: process.env.BOT_WEBHOOK_SECRET || '',

  ADMIN_TELEGRAM_IDS: list(process.env.ADMIN_TELEGRAM_IDS).map(Number).filter(Number.isFinite),
  CORS_ORIGINS: list(process.env.CORS_ORIGINS),
  INIT_DATA_MAX_AGE_SECONDS: num(process.env.INIT_DATA_MAX_AGE_SECONDS, 86400),
  DEV_AUTH_BYPASS: NODE_ENV !== 'production' && process.env.DEV_AUTH_BYPASS === 'true',

  APP_NAME: process.env.APP_NAME || 'Campus Eats',
  UNIVERSITY_NAME: process.env.UNIVERSITY_NAME || 'Our University',
  CURRENCY: process.env.CURRENCY || 'ETB',
  TIMEZONE: process.env.TIMEZONE || 'Africa/Addis_Ababa',

  ORDER_ACCEPT_TIMEOUT_MINUTES: num(process.env.ORDER_ACCEPT_TIMEOUT_MINUTES, 5),
  UNCLAIMED_ALERT_MINUTES: num(process.env.UNCLAIMED_ALERT_MINUTES, 15),
  MAX_ACTIVE_ORDERS_PER_CUSTOMER: num(process.env.MAX_ACTIVE_ORDERS_PER_CUSTOMER, 3),
  MAX_ACTIVE_DELIVERIES_PER_DRIVER: num(process.env.MAX_ACTIVE_DELIVERIES_PER_DRIVER, 3),
  DELIVERY_CODE_MAX_ATTEMPTS: num(process.env.DELIVERY_CODE_MAX_ATTEMPTS, 5),

  PAYMENT_VERIFIER: ['direct', 'verifyet', 'off'].includes(process.env.PAYMENT_VERIFIER)
    ? process.env.PAYMENT_VERIFIER
    : 'direct',
  TELEBIRR_RECEIVER_PHONE: process.env.TELEBIRR_RECEIVER_PHONE || '',
  TELEBIRR_RECEIVER_NAME: process.env.TELEBIRR_RECEIVER_NAME || '',
  CBE_RECEIVER_ACCOUNT: (process.env.CBE_RECEIVER_ACCOUNT || '').replace(/\D/g, ''),
  CBE_RECEIVER_NAME: process.env.CBE_RECEIVER_NAME || '',
  TOPUP_MAX_AGE_HOURS: num(process.env.TOPUP_MAX_AGE_HOURS, 72),
  VERIFY_RELAY_URL: process.env.VERIFY_RELAY_URL || '',
  VERIFY_RELAY_KEY: process.env.VERIFY_RELAY_KEY || '',
  RECEIPT_TLS_INSECURE: process.env.RECEIPT_TLS_INSECURE === 'true',
  VERIFYET_API_KEY: process.env.VERIFYET_API_KEY || '',
  VERIFYET_BASE_URL: (process.env.VERIFYET_BASE_URL || 'https://verify.et').replace(/\/$/, ''),

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
};

export function assertEnv() {
  const required = ['MONGODB_URI'];
  if (!env.DEV_AUTH_BYPASS) required.push('TELEGRAM_BOT_TOKEN');

  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    console.error(
      `❌ Missing required environment variables: ${missing.join(', ')}.\n` +
        '   Copy backend/.env.example to backend/.env and fill them in.'
    );
    process.exit(1);
  }
  if (!env.ADMIN_TELEGRAM_IDS.length) {
    console.warn('⚠️  ADMIN_TELEGRAM_IDS is empty – nobody will have admin access.');
  }
  if (env.isProd && !env.CORS_ORIGINS.length) {
    console.warn('⚠️  CORS_ORIGINS is empty in production – any website can call your API.');
  }
  if (env.PAYMENT_VERIFIER !== 'off' && !env.TELEBIRR_RECEIVER_PHONE && !env.CBE_RECEIVER_ACCOUNT) {
    console.warn('⚠️  No TELEBIRR_RECEIVER_PHONE / CBE_RECEIVER_ACCOUNT set – top-ups will need manual approval.');
  }
  if (env.PAYMENT_VERIFIER === 'verifyet' && !env.VERIFYET_API_KEY) {
    console.warn('⚠️  PAYMENT_VERIFIER=verifyet but VERIFYET_API_KEY is empty.');
  }
  if (env.ENABLE_BOT && !env.MINI_APP_URL.startsWith('https://')) {
    console.warn('⚠️  MINI_APP_URL is not an https URL – bot "Open app" buttons are disabled.');
  }
}
