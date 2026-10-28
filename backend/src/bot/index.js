import { Bot, webhookCallback } from 'grammy';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { setTelegramWebhookHandler } from '../app.js';
import { appButton, escapeHtml, setBot } from '../services/telegram.js';
import { findOrCreateUser } from '../services/userService.js';
import { tr } from '../i18n/messages.js';

const menuButton = (lang) =>
  env.MINI_APP_URL.startsWith('https://')
    ? { type: 'web_app', text: tr(lang, 'menuButton'), web_app: { url: env.MINI_APP_URL } }
    : undefined;

function createBot() {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const user = await findOrCreateUser(ctx.from);
    if (user.botBlocked) await User.updateOne({ _id: user._id }, { botBlocked: false });
    const lang = user.language;

    // Menu button next to the message box, in the user's language
    const mb = menuButton(lang);
    if (mb) await ctx.api.setChatMenuButton({ chat_id: ctx.chat.id, menu_button: mb }).catch(() => {});

    await ctx.reply(
      tr(lang, 'welcome', {
        name: escapeHtml(ctx.from.first_name),
        app: escapeHtml(env.APP_NAME),
        uni: escapeHtml(env.UNIVERSITY_NAME),
      }),
      { parse_mode: 'HTML', reply_markup: appButton(tr(lang, 'btnOrderFood'), '/') }
    );
  });

  bot.command('help', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id }).select('language').lean();
    const lang = user?.language || (ctx.from.language_code === 'am' ? 'am' : 'en');
    return ctx.reply(tr(lang, 'help'), { reply_markup: appButton(tr(lang, 'btnOpenApp'), '/') });
  });

  bot.on('message', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const user = await User.findOne({ telegramId: ctx.from.id }).select('language').lean();
    const lang = user?.language || (ctx.from.language_code === 'am' ? 'am' : 'en');
    return ctx.reply(tr(lang, 'fallback'), { reply_markup: appButton(tr(lang, 'btnOpenApp'), '/') });
  });

  bot.catch((err) => console.error('Bot error:', err.error?.message || err));
  return bot;
}

export async function startBot() {
  if (!env.ENABLE_BOT) {
    console.log('ℹ️  Telegram bot disabled (ENABLE_BOT=false)');
    return null;
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN missing – bot not started');
    return null;
  }

  const bot = createBot();
  setBot(bot);

  try {
    await bot.init();
    for (const lang of ['en', 'am']) {
      await bot.api.setMyCommands(
        [
          { command: 'start', description: tr(lang, 'cmdStart') },
          { command: 'help', description: tr(lang, 'cmdHelp') },
        ],
        lang === 'am' ? { language_code: 'am' } : {}
      );
    }
    // Default "Order" button next to the message box
    if (menuButton('en')) await bot.api.setChatMenuButton({ menu_button: menuButton('en') });

    if (env.BOT_WEBHOOK_URL) {
      setTelegramWebhookHandler(
        webhookCallback(bot, 'express', { secretToken: env.BOT_WEBHOOK_SECRET || undefined })
      );
      await bot.api.setWebhook(`${env.BOT_WEBHOOK_URL}/api/telegram/webhook`, {
        secret_token: env.BOT_WEBHOOK_SECRET || undefined,
        drop_pending_updates: true,
      });
      console.log(`🤖 Bot @${bot.botInfo.username} running with webhook`);
    } else {
      await bot.api.deleteWebhook();
      bot.start({ drop_pending_updates: true }).catch((err) => console.error('Bot polling stopped:', err.message));
      console.log(`🤖 Bot @${bot.botInfo.username} running with long polling`);
    }
  } catch (err) {
    console.error('❌ Could not start Telegram bot (check TELEGRAM_BOT_TOKEN):', err.message);
  }
  return bot;
}
