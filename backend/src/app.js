import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { sanitize } from './middleware/sanitize.js';
import { errorHandler, notFound } from './middleware/error.js';
import { peekTelegramId } from './utils/telegramAuth.js';
import apiRoutes from './routes/index.js';

/** Set by the bot module when running in webhook mode */
let telegramWebhookHandler = null;
export const setTelegramWebhookHandler = (handler) => {
  telegramWebhookHandler = handler;
};

export const corsOrigin = (origin, cb) => {
  // No origin = server-to-server / curl. Empty list = allow all (development).
  if (!origin || env.CORS_ORIGINS.length === 0 || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
  cb(new Error(`Origin ${origin} not allowed by CORS`));
};

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Render/Railway/Nginx

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(sanitize);
  // Don't fill the log with keep-alive / uptime pings
  app.use(morgan(env.isProd ? 'tiny' : 'dev', { skip: (req) => req.url === '/api/health' }));

  app.get('/', (req, res) => res.json({ name: `${env.APP_NAME} API`, status: 'ok' }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  // Telegram bot webhook (only used when BOT_WEBHOOK_URL is set)
  app.post('/api/telegram/webhook', (req, res, next) =>
    telegramWebhookHandler ? telegramWebhookHandler(req, res, next) : res.sendStatus(404)
  );

  // Rate limit per Telegram user (many students share one campus IP)
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 240,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        const auth = req.headers.authorization || '';
        const tgId = auth.startsWith('tma ') ? peekTelegramId(auth.slice(4)) : null;
        return tgId ? `tg:${tgId}` : req.headers['x-dev-telegram-id'] ? `dev:${req.headers['x-dev-telegram-id']}` : req.ip;
      },
      message: { message: 'Too many requests, slow down a little.' },
    })
  );

  app.use('/api', apiRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
