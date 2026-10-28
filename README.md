# Campus Eats – Telegram Mini App for university food delivery

Students order from campus cafes inside Telegram, cafes accept and prepare, student drivers pick
orders and deliver, and an admin runs everything. Payment is **cash on delivery**.

```
campus-delivery/
├── backend/    Node + Express + MongoDB + Socket.io + Telegram bot   → deploy to Render / Railway / VPS
└── frontend/   React + Vite Telegram Mini App                        → deploy to Vercel / Netlify / Cloudflare Pages
```

---

## 1. Roles

| Role | What they do |
|---|---|
| **Customer** (student, teacher, staff…) | Browse cafes, order, track live, give the delivery code, rate |
| **Cafe owner** | Accept/decline orders, manage menu & sold-out items, staff, stats, reviews |
| **Cafe staff** | Accept orders and toggle sold-out items (no prices, stats or staff) |
| **Driver** (students or staff) | Prepaid wallet, go online, take orders, pay the cafe at pickup, confirm delivery with code, earnings |
| **Admin** | Approve cafes/drivers, all orders, reassign/cancel, locations & fees, commission, driver wallets & top-ups, broadcast |

Everyone can also order food. Drivers, cafe staff and admins switch with the **🍔 Order food / 💼 Dashboard** button.

### First time someone opens the app

1. **/start** – the bot explains the app and shows **📝 Enter my details**.
2. **Step 1 – details:** full name + phone number (everyone, including the admin).
3. **Step 2 – “What do you want to do?”** (regular users only):
   - *I am a…* Student / Teacher / Staff / Other
   - *I want to…* **Order food** → home screen · **Deliver and earn** → driver application ·
     **Register my cafe** → cafe registration
4. Drivers and cafes wait for the admin to approve them, and can order food meanwhile.

**Admins** (set with `ADMIN_TELEGRAM_IDS` in the backend `.env`) skip step 2: after their details
they go straight to the admin dashboard, and `/start` shows **⚙️ Open admin dashboard**.
Approved cafe owners and drivers get their own `/start` message and button the same way.
Nobody can give themselves a role – deliver/cafe are only *applications* the admin approves.

## 2. Order flow

```
Student places order ─► pending ──(cafe accepts within 5 min, else auto-cancel)──► accepted
   accepted ─► preparing ─► ready          (drivers can take it any time after "accepted")
   driver taps "Take it" ─► "I picked it up" ─► picked_up ─► enters student's 4-digit code ─► delivered
```

* Each order gets a **4-digit delivery code** that only the student sees. The driver must enter it to
  finish the delivery. That stops fake "delivered" clicks. After 5 wrong tries the admin has to confirm.
* Bot messages go out at every step (new order to cafe, available delivery to online drivers, "on the way + code" to student…).
* Screens update live through Socket.io.
* Prices are always recalculated on the server, so nobody can change prices from their phone.

### Money (cash on delivery + prepaid driver wallet)

**All fees are set by the admin** (Admin → More → Platform settings), each as a **percentage or a fixed amount in birr per order**:

| Setting | Default | Where |
|---|---|---|
| Commission from cafes (on the food price) | 10% | Platform settings; a special rate per cafe in People → Cafes → Commission |
| Platform cut of the delivery fee (driver keeps the rest) | 20% | Platform settings |
| Delivery fee itself | per place | Delivery locations |

Changes apply to new orders only; each order stores its own split. The settings screen shows a live birr example.
Example with the defaults:

| Step | Who | Amount |
|---|---|---|
| Student pays the driver in cash | student → driver | 200 food + 15 delivery = **215** |
| Driver pays the cafe at pickup | driver → cafe | 200 − 10% = **180** |
| Driver holds | – | 35 |
| Platform cut taken from driver's **wallet** | wallet → you | 20 commission + 3 delivery share = **23** |
| Driver's real earning | – | 35 − 23 = **12** |

**Why a prepaid wallet:** the platform holds its cut before any order is delivered, so no driver can run off with your share.
A driver can't take an order unless the wallet covers its fee, and gets a bot message when the balance drops to **10 birr**
(Admin → Settings → Low balance alert). Minimum top-up is **100 birr**.

### Automatic top-up verification (Telebirr & CBE)

The driver sends money to your Telebirr number or CBE account, then types only the **transaction ID** from their SMS
(Telebirr e.g. `CJK4ABC12D`, CBE e.g. `FT25123ABC45`). The server downloads the **official receipt** and credits the wallet instantly:

| Source | Receipt address |
|---|---|
| Telebirr | `https://transactioninfo.ethiotelecom.et/receipt/<ID>` (HTML) |
| CBE | `https://apps.cbe.com.et:100/?id=<FT ref><last 8 digits of an account>` (PDF) |

Checks before money is added (`backend/src/services/payments/`):
1. Receipt exists on the official site and is **Completed** (screenshots are never trusted).
2. Money went to **your** account: receiver name **and** the visible last 4 digits must match
   `TELEBIRR_RECEIVER_PHONE/NAME` or `CBE_RECEIVER_ACCOUNT/NAME`.
3. Payment is recent (`TOPUP_MAX_AGE_HOURS`, default 72) and the reference matches.
4. Amount ≥ minimum top-up. The wallet gets the amount **on the receipt**, not what the driver typed.
5. Each transaction ID can be used **once** (database unique index), even if two requests arrive at the same moment.

Results: ✅ verified → credited instantly · ❌ not ours / not found / too old → rejected with the reason ·
⚠️ bank unreachable or below minimum → goes to **Admin → Wallets** with a **Check again** button and Approve/Reject.
Cash or other banks are always approved manually.

**Important – hosting location.** Telebirr and CBE usually block servers outside Ethiopia. Choose one:

* **Host the backend in Ethiopia** (e.g. an Ethio Telecom / local data-centre VPS) – nothing else needed.
* **Keep Render/Railway + a relay:** upload `backend/relay/receipt-relay.php` to any cheap Ethiopian cPanel host, set a
  secret key in it, then set `VERIFY_RELAY_URL` and `VERIFY_RELAY_KEY`. The relay only fetches the two receipt addresses.
* **Use Verify.ET** (paid API that works from anywhere and also reads new CBE app receipt links):
  `PAYMENT_VERIFIER=verifyet` + `VERIFYET_API_KEY`. Test it with a real payment first.

These receipt pages are public but **not official APIs** – Ethio Telecom or CBE can change them without notice. If a
check starts failing, top-ups fall back to admin review (no money is lost), and the parser in
`services/payments/telebirr.js` / `cbe.js` may need a small update. Test with a real 100 birr payment before launch.

**Other protections:** the cafe sees how much the driver must pay at pickup and can tap **"Driver didn't pay"**;
deliveries complete only with the student's 4-digit code; every wallet change is in a ledger.

### Single-gender dorms

Each location has **Who can deliver here**: *Any driver*, *Female drivers only* or *Male drivers only*
(Admin → More → Delivery locations). Female dorms get female drivers, male dorms get male drivers: other drivers don't
see those orders, can't take them, can't be assigned them, and don't get the bot alert. Drivers choose their gender
when applying; the admin can correct it in People → Drivers.

### Languages (English / አማርኛ)

Every screen, bot message and error has English and Amharic. Users switch with the **EN / አማ** button (top right, onboarding
and Profile). The choice is saved to their profile, so the bot also messages them in that language. Texts live in
`frontend/src/i18n/en.js`, `frontend/src/i18n/am.js`, `backend/src/i18n/messages.js` and `backend/src/i18n/errors.js`.
Have a native speaker review the Amharic before launch.

---

## 3. What you need to give me / set up

| # | Item | Where to get it | Goes in |
|---|---|---|---|
| 1 | **Bot token** | Telegram → @BotFather → `/newbot` | `backend/.env` `TELEGRAM_BOT_TOKEN` |
| 2 | **Your Telegram ID** (numeric) | Message @userinfobot | `backend/.env` `ADMIN_TELEGRAM_IDS` |
| 3 | **MongoDB database** | [MongoDB Atlas](https://www.mongodb.com/atlas) free cluster → Connect → Drivers | `backend/.env` `MONGODB_URI` |
| 4 | **Cloudinary** (images, optional) | [cloudinary.com](https://cloudinary.com) free account → Dashboard | `backend/.env` `CLOUDINARY_*` |
| 5 | University name, app name | – | `backend/.env` `UNIVERSITY_NAME`, `APP_NAME` |
| 6 | List of dorms/buildings + delivery fee for each | – | Add in the app: Admin → More → Delivery locations |
| 7 | Cafe commission and platform cut of the delivery fee (percent or fixed birr) | – | Admin → More → Platform settings |
| 8 | Your Telebirr number + name and/or CBE account + name (where drivers send top-ups) | Exactly as shown on receipts | `backend/.env` `TELEBIRR_RECEIVER_*`, `CBE_RECEIVER_*` |
| 8b | Where the backend runs: in Ethiopia, or abroad + relay / Verify.ET | See "Automatic top-up verification" | `backend/.env` `VERIFY_RELAY_*` or `VERIFYET_*` |
| 9 | Which dorms are female-only and which are male-only | – | Admin → More → Delivery locations |

In Atlas → Network Access, allow `0.0.0.0/0` (or your server's IP) so the backend can connect.

---

## 4. Run it on your computer

Requirements: **Node.js 20+**.

```bash
# Backend
cd backend
cp .env.example .env           # then fill in MONGODB_URI, TELEGRAM_BOT_TOKEN, ADMIN_TELEGRAM_IDS
npm install
npm run seed                   # creates settings + sample locations
npm run dev                    # http://localhost:5000

# Frontend (new terminal)
cd frontend
cp .env.example .env           # VITE_API_URL=http://localhost:5000
npm install
npm run dev                    # http://localhost:5173
```

### Test every role in a normal browser (no Telegram needed)

Telegram only opens **https** URLs, so for quick testing use dev login:

1. `backend/.env`: `DEV_AUTH_BYPASS=true` (only works when `NODE_ENV` is not `production`)
2. `cd backend && npm run seed -- --demo` creates a demo cafe with a menu and 5 users:
   `1000001` cafe owner · `1000002` student · `1000003` male driver · `1000004` admin · `1000005` female driver (Amharic).
   Demo drivers start with 200 in their wallet.
3. Open http://localhost:5173. The start screen lets you pick a role, and **Profile → Dev: switch user** changes it.
   Open two browser windows (student + cafe) to watch orders update live.

### Test inside Telegram on your phone

Expose both apps over https with a tunnel, e.g. [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/):

```bash
cloudflared tunnel --url http://localhost:5173   # → https://xxx.trycloudflare.com  (frontend)
cloudflared tunnel --url http://localhost:5000   # → https://yyy.trycloudflare.com  (backend)
```

Set `frontend/.env` `VITE_API_URL=https://yyy…` and `backend/.env` `MINI_APP_URL=https://xxx…`, restart both, then send
`/start` to your bot.

---

## 5. Deploy

### Backend → Render (or Railway)

1. Push the project to GitHub.
2. Render → **New Web Service** → pick the repo → **Root directory:** `backend`
   * Build command: `npm install`
   * Start command: `npm start`
   * Instance: one instance (the bot and the order timer run inside the server)
3. Add the environment variables from `backend/.env.example`:
   * `NODE_ENV=production`
   * `MINI_APP_URL=https://<your-frontend-domain>`
   * `CORS_ORIGINS=https://<your-frontend-domain>`
   * `BOT_WEBHOOK_URL=https://<your-backend>.onrender.com` and a random `BOT_WEBHOOK_SECRET`
   * `DEV_AUTH_BYPASS=false`
4. After the first deploy run the seed once (Render → Shell): `npm run seed`

> Render's free plan sleeps after 15 min of no traffic, which delays the first request and live updates.
> For real use pick a paid instance, Railway, or a small VPS (run with `pm2 start src/server.js`).

### Frontend → Vercel (or Netlify / Cloudflare Pages)

1. New project → same repo → **Root directory:** `frontend`. Framework: Vite (build `npm run build`, output `dist`).
2. Environment variable: `VITE_API_URL=https://<your-backend>.onrender.com` (leave `VITE_DEV_TELEGRAM_ID` empty).
3. Deploy. `vercel.json` / `public/_redirects` are included so page refreshes work.

### Connect the bot

* The backend automatically sets the bot's **menu button** to `MINI_APP_URL` on start.
* Optional: in @BotFather use `/newapp` (same frontend URL) to get a shareable `t.me/yourbot/app` link.
* Send `/start` to the bot → tap **Order food**. Since your ID is in `ADMIN_TELEGRAM_IDS`, you'll land on the admin dashboard.

### First things to do as admin

1. More → **Delivery locations**: replace the sample dorms/buildings with your real ones and fees.
2. More → **Platform settings**: cafe commission and delivery-fee cut (percent or fixed birr each), minimum top-up and low-balance alert.
3. Ask cafe owners to open the bot → Profile → **Register your cafe**, then approve them in People → Cafes.
4. Ask students who want to deliver → Profile → **Become a driver**, approve them in People → Drivers.

---

## 6. API overview

All routes are under `/api` and require Telegram auth (`Authorization: tma <initData>`).

| Area | Routes |
|---|---|
| Me | `GET /auth/me`, `PATCH /users/me`, `POST /users/me/driver-application`, `GET /users/me/cafe-application` |
| Shop | `GET /locations`, `GET /cafes`, `GET /cafes/search?q=`, `GET /cafes/:id`, `GET /cafes/:id/reviews`, `POST /cafes/apply` |
| Orders | `POST /orders`, `GET /orders?scope=active\|past`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /orders/:id/review` |
| Cafe | `/my-cafe` – profile, `accepting`, `menu` CRUD + `availability`, `orders` + `accept/reject/preparing/ready/cancel/report-unpaid`, `staff`, `stats`, `reviews` |
| Driver | `/driver` – `status`, `available`, `active`, `history`, `earnings`, `wallet`, `wallet/topups`, `orders/:id/claim\|release\|pickup\|deliver` |
| Admin | `/admin` – `stats`, `orders` (+ `cancel`, `assign`, `release-driver`, `force-deliver`, `resolve-issue`), `cafes`, `drivers`, `users`, `locations`, `settings`, `topups` (+ `approve`/`reject`/`recheck`), `wallets` (+ `adjust`), `broadcast` |
| Upload | `POST /uploads/image` (multipart `image`, max 5 MB) |

Socket.io events (client listens): `order:new`, `order:updated`, `pool:new`, `pool:changed`, `me:updated`, `admin:applications`, `admin:topups`.

## 7. Backend structure

```
backend/src
├── server.js            starts DB, HTTP, Socket.io, bot, jobs
├── app.js               Express app, security, rate limit, routes
├── config/              env.js (all settings), db.js, constants.js
├── models/              User, Cafe, MenuItem, Order, Location, Review, Settings, Counter, WalletTransaction
├── middleware/          auth (Telegram initData), errors, sanitize
├── controllers/         auth, user, cafe, order, myCafe, driver, admin, location
├── routes/index.js      every endpoint and who can use it
├── services/            orderService, walletService, telegram, realtime, upload, userService
│   └── payments/        Telebirr + CBE receipt fetch/parse, Verify.ET, fraud checks
├── i18n/                bot messages + API errors in English and Amharic
├── socket/              Socket.io rooms per role
├── bot/                 /start, /help, menu button, webhook/polling
├── jobs/                auto-cancel unanswered orders, alert admins about unclaimed orders
└── scripts/seed.js      starter data (+ --demo)
```

## 8. Ideas for later

Telebirr merchant API / Chapa for top-ups, online payment for students, promo codes, scheduled orders ("deliver at 12:30"),
driver batching suggestions, cafe opening hours per weekday, PWA install for cafe tablets.
