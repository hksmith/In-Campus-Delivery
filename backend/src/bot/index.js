import { Bot, webhookCallback } from 'grammy';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { setTelegramWebhookHandler } from '../app.js';
import { appButton, escapeHtml, setBot } from '../services/telegram.js';
import { findOrCreateUser } from '../services/userService.js';
import { tr } from '../i18n/messages.js';

const menuButton = (lang, textKey = 'menuButton') =>
  env.MINI_APP_URL.startsWith('https://')
    ? { type: 'web_app', text: tr(lang, textKey), web_app: { url: env.MINI_APP_URL } }
    : undefined;

/** What /start says and opens, depending on who the user is */
const ROLE_START = {
  admin: { welcome: 'welcomeAdmin', button: 'btnAdminDash', menu: 'menuAdmin', path: '/admin' },
  cafe_owner: { welcome: 'welcomeCafe', button: 'btnCafeDash', menu: 'menuCafe', path: '/cafe/orders' },
  cafe_staff: { welcome: 'welcomeCafe', button: 'btnCafeDash', menu: 'menuCafe', path: '/cafe/orders' },
  driver: { welcome: 'welcomeDriver', button: 'btnDriverDash', menu: 'menuDriver', path: '/driver' },
  customer: { welcome: 'welcome', button: 'btnOrderFood', menu: 'menuButton', path: '/' },
};

function createBot() {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const user = await findOrCreateUser(ctx.from);
    if (user.botBlocked) await User.updateOne({ _id: user._id }, { botBlocked: false });
    const lang = user.language;
    const role = ROLE_START[user.role] || ROLE_START.customer;
    const needsDetails = !user.fullName || !user.phone;
    // Regular users also pick what they want to do (order / deliver / own a cafe) after their details
    const isNewUser = user.role === 'customer' && !user.onboarded;

    // Menu button next to the message box, in the user's language and for their role
    const mb = menuButton(lang, isNewUser ? 'menuStart' : role.menu);
    if (mb) await ctx.api.setChatMenuButton({ chat_id: ctx.chat.id, menu_button: mb }).catch(() => {});

    const vars = {
      name: escapeHtml(ctx.from.first_name),
      app: escapeHtml(env.APP_NAME),
      uni: escapeHtml(env.UNIVERSITY_NAME),
    };

    let text;
    let button;
    if (isNewUser) {
      // New person: details first, then "What do you want to do?"
      text = tr(lang, 'welcomeNew', vars);
      button = appButton(tr(lang, needsDetails ? 'btnSetup' : 'btnContinue'), '/');
    } else {
      // Admin, cafe, driver or a student who already chose
      text = tr(lang, role.welcome, vars);
      if (needsDetails) text += tr(lang, 'setupFirst');
      button = appButton(tr(lang, needsDetails ? 'btnSetup' : role.button), needsDetails ? '/' : role.path);
    }

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: button });
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
    console.error('❌ Could not start Telegram bot:', err.message);
    if (/401|Unauthorized|Not Found/i.test(err.message)) console.error('   → TELEGRAM_BOT_TOKEN looks wrong (get it again from @BotFather).');
    if (/setWebhook/i.test(err.message)) console.error('   → Check BOT_WEBHOOK_URL (your backend https address) and BOT_WEBHOOK_SECRET (only A-Z a-z 0-9 _ -).');
  }
  return bot;
}
