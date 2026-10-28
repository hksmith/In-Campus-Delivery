import http from 'node:http';
import { assertEnv, env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSocket } from './socket/index.js';
import { startBot } from './bot/index.js';
import { startJobs, stopJobs } from './jobs/orderJobs.js';
import { Settings } from './models/index.js';

async function main() {
  assertEnv();
  await connectDB();
  await Settings.getSettings(); // make sure the settings document exists

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  const bot = await startBot();
  startJobs();

  server.listen(env.PORT, () => {
    console.log(`🚀 API listening on port ${env.PORT} (${env.NODE_ENV})`);
    if (env.DEV_AUTH_BYPASS) console.log('🧪 DEV_AUTH_BYPASS is ON – do not use in production');
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down…`);
    stopJobs();
    if (bot && !env.BOT_WEBHOOK_URL) await bot.stop().catch(() => {});
    server.close();
    await disconnectDB().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
