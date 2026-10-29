import http from 'node:http';
import https from 'node:https';
import { env } from '../config/env.js';

/**
 * Keeps a free Render service awake: Render puts it to sleep after 15 minutes without
 * requests, so we call our own public /api/health every 10 minutes.
 *
 * The address is KEEP_ALIVE_URL, or Render's own RENDER_EXTERNAL_URL (set by Render
 * automatically), or BOT_WEBHOOK_URL. Turn it off with KEEP_ALIVE=false.
 * Tip: also ping from outside (e.g. a cron job on your VPS) in case the service ever restarts asleep.
 */
const INTERVAL_MS = 10 * 60 * 1000;
let timer = null;

function target() {
  const base = env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || env.BOT_WEBHOOK_URL;
  if (!base) return null;
  return base.includes('/api/health') ? base : `${base.replace(/\/$/, '')}/api/health`;
}

function ping(url) {
  const client = url.startsWith('http://') ? http : https;
  const req = client.get(url, { timeout: 15000, headers: { 'User-Agent': 'keep-alive' } }, (res) => res.resume());
  req.on('timeout', () => req.destroy(new Error('timed out')));
  req.on('error', (err) => console.warn(`Keep-alive ping failed: ${err.message}`));
}

export function startKeepAlive() {
  if (!env.KEEP_ALIVE || !env.isProd) return;
  const url = target();
  if (!url) return;
  timer = setInterval(() => ping(url), INTERVAL_MS);
  timer.unref();
  console.log(`⏰ Keep-alive: pinging ${url} every 10 minutes`);
}

export function stopKeepAlive() {
  if (timer) clearInterval(timer);
  timer = null;
}
