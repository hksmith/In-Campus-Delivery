/**
 * Telegram bot messages in English and Amharic.
 * Use {name} placeholders; tr() fills them in. Values must already be HTML-escaped.
 */
const en = {
  // Buttons
  btnOrderFood: '🍔 Order food',
  btnOpenApp: 'Open app',
  btnViewOrder: 'View order',
  btnOpenOrders: 'Open orders',
  btnSeeDeliveries: 'See deliveries',
  btnDeliveries: 'My deliveries',
  btnOrderAgain: 'Order again',
  btnRate: 'Rate order',
  btnAdmin: 'Open admin',
  btnReview: 'Review',
  btnDashboard: 'Open dashboard',
  btnStartDelivering: 'Start delivering',
  menuButton: 'Order',
  menuAdmin: 'Admin',
  menuCafe: 'Orders',
  menuDriver: 'Deliver',
  menuStart: 'Start',
  btnSetup: '📝 Enter my details',
  btnAdminDash: '⚙️ Open admin dashboard',
  btnCafeDash: '🍽 Open cafe orders',
  btnDriverDash: '🛵 Open deliveries',

  // Role-based /start messages
  welcomeAdmin:
    '👋 Hi {name}!\n\nYou are the <b>admin</b> of <b>{app}</b> at {uni}.\n\n' +
    '📊 See all orders and money\n🏪 Approve cafes and 🛵 drivers\n⚙️ Set fees, dorms and wallet rules\n\nTap the button below to open your dashboard.',
  welcomeCafe:
    '👋 Hi {name}!\n\nThis is your <b>cafe dashboard</b> on <b>{app}</b>.\n\n' +
    '🔔 Accept new orders\n🍽 Manage your menu\n📈 See your sales\n\nTap the button below to open it.',
  welcomeDriver:
    '👋 Hi {name}!\n\nReady to deliver on <b>{app}</b>?\n\n' +
    '📦 Pick orders near you\n💰 Earn the delivery fee\n👛 Keep your wallet topped up\n\nTap the button below to open your deliveries.',
  setupFirst: '\n\n📝 <b>First, enter your details</b> (name and phone number) – it takes 30 seconds.',
  welcomeNew:
    '👋 Hi {name}!\n\nWelcome to <b>{app}</b> at {uni}.\n\n' +
    '🍔 Order food from campus cafes\n🛵 Deliver orders and earn money\n🏪 Get orders for your cafe\n\n' +
    '📝 <b>First, enter your details</b>, then choose what you want to do.',
  btnContinue: '📝 Continue',

  // Bot commands
  welcome:
    '👋 Hi {name}!\n\nWelcome to <b>{app}</b> – food from the cafes at {uni}, delivered to your dorm or building.\n\n' +
    '🍔 Order from any campus cafe\n🛵 Track your delivery live\n💵 Pay cash when it arrives\n\nTap the button below to start.',
  help:
    'Use the "Open" button or /start to open the app.\n\n' +
    '• Want to deliver and earn? Open the app → Profile → Become a driver.\n' +
    '• Own a campus cafe? Open the app → Profile → Register your cafe.',
  fallback: 'Tap the button to open the app 👇',
  cmdStart: 'Open the food delivery app',
  cmdHelp: 'How it works',

  reason: '\nReason: {reason}',
  by_customer: 'by the student',
  by_cafe: 'by the cafe',
  by_driver: 'by the driver',
  by_admin: 'by the admin',
  by_system: 'automatically',

  // Orders
  newOrder:
    '🆕 <b>New order {n}</b>\n{items}\n\nFood total: <b>{subtotal}</b>\nDriver pays you at pickup: <b>{payout}</b>\n' +
    'Deliver to: {place}{note}\n\n⏱ Accept within {mins} min or it is cancelled automatically.',
  orderNote: '\nNote: {note}',
  accepted: '✅ <b>{cafe}</b> accepted your order {n}.',
  acceptedEta: ' Ready in about {mins} min.',
  newDelivery:
    '🛵 <b>New delivery available</b>\n{cafe} → {place}\nPay the cafe: {payout}\nYou earn: <b>{earn}</b>',
  rejected: "❌ <b>{cafe}</b> couldn't take your order {n}.{reason}",
  readyWithDriver: '🍽 Your order {n} is ready and your driver is picking it up.',
  readyNoDriver: '🍽 Your order {n} is ready. Waiting for a driver.',
  readyDriver: '📦 Order {n} is ready for pickup at <b>{cafe}</b>. Pay the cafe {payout}.',
  claimed: '🛵 {driver} will deliver your order {n}.',
  assigned: '📌 The admin assigned order {n} ({cafe} → {place}) to you.',
  pickedUp:
    '🚀 Your order {n} is on the way!\n\nGive this code to the driver when you receive it: <b>{code}</b>\nPay <b>{total}</b> in cash.',
  delivered: '🎉 Order {n} delivered. Enjoy your meal! Tap below to rate it.',
  cancelledCustomer: '🚫 Your order {n} was cancelled.{reason}',
  cancelledCafe: '🚫 Order {n} was cancelled {by}.{reason}',
  cancelledDriver: '🚫 Order {n} you were delivering was cancelled.{reason}',
  released: 'ℹ️ Order {n} was unassigned from you by the admin.',
  unclaimed: '⚠️ Order {n} ({cafe} → {place}) has had no driver for {mins} min.',
  pickupIssue: '🚨 {cafe} reports that driver {driver} did not pay at pickup for order {n}.{note}',

  // Wallet
  topupRequest:
    '💰 Top-up request: <b>{name}</b> sent {amount} ({method}{ref}). Check your account, then approve.',
  topupApproved: '✅ Your top-up of {amount} was confirmed. Wallet balance: <b>{balance}</b>',
  topupRejected: '❌ Your top-up of {amount} was not confirmed. Reason: {reason}',
  topupReview: '💰 Top-up needs your check: <b>{name}</b> paid {amount} ({method}{ref}).\n{reason}',
  topupCheckDown:
    '⚠️ Could not reach Telebirr/CBE to check a top-up from <b>{name}</b> ({method}{ref}). Open the app and tap “Check again”, or verify it yourself.\n{reason}',
  walletLow: '🔋 Your wallet is low: <b>{balance}</b>. Top up (minimum 100 birr) so you can keep taking orders.',
  btnTopUp: 'Top up wallet',

  // Accounts
  cafeApproved: '🎉 Your cafe <b>{name}</b> was approved! Add your menu and start receiving orders.',
  cafeReactivated: '✅ Your cafe <b>{name}</b> is active again.',
  cafeRejected: '❌ Your cafe registration was not approved.{reason}',
  cafeSuspended: '⛔ Your cafe <b>{name}</b> was suspended.{reason}',
  driverApproved: '🎉 You are now an approved driver! Top up your wallet, then go online to start delivering.',
  driverRejected: '❌ Your driver application was not approved.{reason}',
  driverSuspended: '⛔ Your driver account was suspended.{reason}',
  staffAdded: '👋 You were added as staff at <b>{cafe}</b>.',
  newCafeAdmin: '🏪 New cafe registration: <b>{name}</b> by {owner}.',
  newDriverAdmin: '🛵 New driver application from <b>{name}</b>.',
};

const am = {
  btnOrderFood: '🍔 ምግብ ይዘዙ',
  btnOpenApp: 'መተግበሪያውን ክፈት',
  btnViewOrder: 'ትዕዛዙን ይመልከቱ',
  btnOpenOrders: 'ትዕዛዞችን ክፈት',
  btnSeeDeliveries: 'ማድረሻዎችን ይመልከቱ',
  btnDeliveries: 'የእኔ ማድረሻዎች',
  btnOrderAgain: 'እንደገና ይዘዙ',
  btnRate: 'ትዕዛዙን ይገምግሙ',
  btnAdmin: 'የአስተዳዳሪ ገጽ',
  btnReview: 'ይገምግሙ',
  btnDashboard: 'ዳሽቦርድ ክፈት',
  btnStartDelivering: 'ማድረስ ይጀምሩ',
  menuButton: 'ይዘዙ',
  menuAdmin: 'አስተዳዳሪ',
  menuCafe: 'ትዕዛዞች',
  menuDriver: 'ማድረስ',
  menuStart: 'ጀምር',
  btnSetup: '📝 መረጃዬን አስገባ',
  btnAdminDash: '⚙️ የአስተዳዳሪ ገጽ ክፈት',
  btnCafeDash: '🍽 የካፌ ትዕዛዞችን ክፈት',
  btnDriverDash: '🛵 ማድረሻዎችን ክፈት',

  welcomeAdmin:
    '👋 ሰላም {name}!\n\nእርስዎ የ{uni} <b>{app}</b> <b>አስተዳዳሪ</b> ነዎት።\n\n' +
    '📊 ሁሉንም ትዕዛዞችና ገንዘብ ይመልከቱ\n🏪 ካፌዎችንና 🛵 አድራሾችን ያጽድቁ\n⚙️ ክፍያዎችን፣ ዶርሞችንና የዋሌት ደንቦችን ያስተካክሉ\n\nገጽዎን ለመክፈት ከታች ያለውን ቁልፍ ይጫኑ።',
  welcomeCafe:
    '👋 ሰላም {name}!\n\nይህ በ<b>{app}</b> ላይ ያለው <b>የካፌዎ ገጽ</b> ነው።\n\n' +
    '🔔 አዳዲስ ትዕዛዞችን ይቀበሉ\n🍽 ሜኑዎን ያስተዳድሩ\n📈 ሽያጭዎን ይመልከቱ\n\nለመክፈት ከታች ያለውን ቁልፍ ይጫኑ።',
  welcomeDriver:
    '👋 ሰላም {name}!\n\nበ<b>{app}</b> ለማድረስ ዝግጁ ነዎት?\n\n' +
    '📦 በአቅራቢያዎ ያሉ ትዕዛዞችን ይምረጡ\n💰 የማድረሻ ክፍያውን ያግኙ\n👛 ዋሌትዎን ይሙሉ\n\nማድረሻዎችዎን ለመክፈት ከታች ያለውን ቁልፍ ይጫኑ።',
  setupFirst: '\n\n📝 <b>መጀመሪያ መረጃዎን ያስገቡ</b> (ስምና ስልክ ቁጥር) – 30 ሰከንድ ብቻ ይወስዳል።',
  welcomeNew:
    '👋 ሰላም {name}!\n\nወደ {uni} <b>{app}</b> እንኳን ደህና መጡ።\n\n' +
    '🍔 ከግቢ ካፌዎች ምግብ ይዘዙ\n🛵 ትዕዛዞችን አድርሰው ገንዘብ ያግኙ\n🏪 ለካፌዎ ትዕዛዞችን ይቀበሉ\n\n' +
    '📝 <b>መጀመሪያ መረጃዎን ያስገቡ</b>፣ ከዚያ ምን ማድረግ እንደሚፈልጉ ይምረጡ።',
  btnContinue: '📝 ይቀጥሉ',

  welcome:
    '👋 ሰላም {name}!\n\nወደ <b>{app}</b> እንኳን ደህና መጡ – ከ{uni} ካፌዎች የሚመጣ ምግብ፣ እስከ ዶርምዎ ወይም ህንጻዎ ድረስ።\n\n' +
    '🍔 ከማንኛውም የግቢ ካፌ ይዘዙ\n🛵 ትዕዛዝዎን በቀጥታ ይከታተሉ\n💵 ሲደርስ በጥሬ ገንዘብ ይክፈሉ\n\nለመጀመር ከታች ያለውን ቁልፍ ይጫኑ።',
  help:
    'መተግበሪያውን ለመክፈት "ክፈት" የሚለውን ቁልፍ ወይም /start ይጠቀሙ።\n\n' +
    '• በማድረስ ገቢ ማግኘት ይፈልጋሉ? መተግበሪያ → መገለጫ → አድራሽ ይሁኑ።\n' +
    '• የግቢ ካፌ ባለቤት ነዎት? መተግበሪያ → መገለጫ → ካፌዎን ያስመዝግቡ።',
  fallback: 'መተግበሪያውን ለመክፈት ቁልፉን ይጫኑ 👇',
  cmdStart: 'የምግብ ማድረሻ መተግበሪያውን ክፈት',
  cmdHelp: 'እንዴት ይሰራል',

  reason: '\nምክንያት: {reason}',
  by_customer: 'በተማሪው',
  by_cafe: 'በካፌው',
  by_driver: 'በአድራሹ',
  by_admin: 'በአስተዳዳሪው',
  by_system: 'በራሱ',

  newOrder:
    '🆕 <b>አዲስ ትዕዛዝ {n}</b>\n{items}\n\nየምግብ ድምር: <b>{subtotal}</b>\nአድራሹ ሲወስድ የሚከፍልዎ: <b>{payout}</b>\n' +
    'መድረሻ: {place}{note}\n\n⏱ በ{mins} ደቂቃ ውስጥ ካልተቀበሉ ትዕዛዙ በራሱ ይሰረዛል።',
  orderNote: '\nማስታወሻ: {note}',
  accepted: '✅ <b>{cafe}</b> ትዕዛዝዎን {n} ተቀብሏል።',
  acceptedEta: ' በ{mins} ደቂቃ ገደማ ይዘጋጃል።',
  newDelivery: '🛵 <b>አዲስ ማድረሻ አለ</b>\n{cafe} → {place}\nለካፌው የሚከፍሉት: {payout}\nየሚያገኙት: <b>{earn}</b>',
  rejected: '❌ <b>{cafe}</b> ትዕዛዝዎን {n} መቀበል አልቻለም።{reason}',
  readyWithDriver: '🍽 ትዕዛዝዎ {n} ተዘጋጅቷል፤ አድራሹ እየወሰደው ነው።',
  readyNoDriver: '🍽 ትዕዛዝዎ {n} ተዘጋጅቷል። አድራሽ እየተጠበቀ ነው።',
  readyDriver: '📦 ትዕዛዝ {n} በ<b>{cafe}</b> ለመውሰድ ዝግጁ ነው። ለካፌው {payout} ይክፈሉ።',
  claimed: '🛵 {driver} ትዕዛዝዎን {n} ያደርሳል።',
  assigned: '📌 አስተዳዳሪው ትዕዛዝ {n} ({cafe} → {place}) ለእርስዎ መድቧል።',
  pickedUp:
    '🚀 ትዕዛዝዎ {n} በመንገድ ላይ ነው!\n\nምግቡን ሲቀበሉ ይህን ኮድ ለአድራሹ ይስጡ: <b>{code}</b>\n<b>{total}</b> በጥሬ ገንዘብ ይክፈሉ።',
  delivered: '🎉 ትዕዛዝ {n} ደርሷል። መልካም ምግብ! ለመገምገም ከታች ይጫኑ።',
  cancelledCustomer: '🚫 ትዕዛዝዎ {n} ተሰርዟል።{reason}',
  cancelledCafe: '🚫 ትዕዛዝ {n} {by} ተሰርዟል።{reason}',
  cancelledDriver: '🚫 እያደረሱት የነበረው ትዕዛዝ {n} ተሰርዟል።{reason}',
  released: 'ℹ️ ትዕዛዝ {n} በአስተዳዳሪው ከእርስዎ ተነስቷል።',
  unclaimed: '⚠️ ትዕዛዝ {n} ({cafe} → {place}) ለ{mins} ደቂቃ አድራሽ አላገኘም።',
  pickupIssue: '🚨 {cafe} እንዳሳወቀው አድራሹ {driver} ትዕዛዝ {n} ሲወስድ አልከፈለም።{note}',

  topupRequest: '💰 የዋሌት መሙያ ጥያቄ: <b>{name}</b> {amount} ልኳል ({method}{ref})። በሂሳብዎ ካረጋገጡ በኋላ ያጽድቁ።',
  topupApproved: '✅ የ{amount} ክፍያዎ ተረጋግጧል። የዋሌት ቀሪ ሂሳብ: <b>{balance}</b>',
  topupRejected: '❌ የ{amount} ክፍያዎ አልተረጋገጠም። ምክንያት: {reason}',
  topupReview: '💰 የዋሌት መሙያ ማረጋገጫ ይፈልጋል: <b>{name}</b> {amount} ከፍሏል ({method}{ref})።\n{reason}',
  topupCheckDown:
    '⚠️ ከ<b>{name}</b> የመጣውን መሙያ ({method}{ref}) ለማረጋገጥ ቴሌብር/ሲቢኢ አልተገኙም። መተግበሪያውን ከፍተው “እንደገና አረጋግጥ” ይጫኑ ወይም እራስዎ ያረጋግጡ።\n{reason}',
  walletLow: '🔋 የዋሌትዎ ሂሳብ አንሷል: <b>{balance}</b>። ትዕዛዝ መውሰድ ለመቀጠል ዋሌትዎን ይሙሉ (ዝቅተኛ 100 ብር)።',
  btnTopUp: 'ዋሌት ሙላ',

  cafeApproved: '🎉 ካፌዎ <b>{name}</b> ጸድቋል! ሜኑዎን ያስገቡና ትዕዛዝ መቀበል ይጀምሩ።',
  cafeReactivated: '✅ ካፌዎ <b>{name}</b> እንደገና ስራ ጀምሯል።',
  cafeRejected: '❌ የካፌ ምዝገባዎ አልጸደቀም።{reason}',
  cafeSuspended: '⛔ ካፌዎ <b>{name}</b> ታግዷል።{reason}',
  driverApproved: '🎉 አሁን የጸደቁ አድራሽ ነዎት! ዋሌትዎን ይሙሉ፣ ከዚያ ኦንላይን ሆነው ማድረስ ይጀምሩ።',
  driverRejected: '❌ የአድራሽነት ማመልከቻዎ አልጸደቀም።{reason}',
  driverSuspended: '⛔ የአድራሽ መለያዎ ታግዷል።{reason}',
  staffAdded: '👋 በ<b>{cafe}</b> ሰራተኛ ሆነው ተጨምረዋል።',
  newCafeAdmin: '🏪 አዲስ የካፌ ምዝገባ: <b>{name}</b> በ{owner}።',
  newDriverAdmin: '🛵 አዲስ የአድራሽ ማመልከቻ ከ<b>{name}</b>።',
};

const dictionaries = { en, am };

/** Translate a message key into `lang` (falls back to English) and fill placeholders */
export function tr(lang, key, vars = {}) {
  const dict = dictionaries[lang] || en;
  const template = dict[key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])));
}

/** "\nReason: …" in the right language, or '' when there is no reason */
export const reasonLine = (lang, reason, escape) => (reason ? tr(lang, 'reason', { reason: escape(reason) }) : '');
