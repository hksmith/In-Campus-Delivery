/**
 * Seeds starter data.
 *   npm run seed            → settings + sample campus locations (only if none exist)
 *   npm run seed -- --demo  → also creates demo users, a demo cafe and menu
 *                             (use with DEV_AUTH_BYPASS to test every role in a browser)
 *
 * Demo Telegram IDs (use them as "x-dev-telegram-id" / VITE_DEV_TELEGRAM_ID):
 *   1000001 = cafe owner, 1000002 = student, 1000003 = driver (male), 1000004 = admin,
 *   1000005 = female driver (Amharic). Demo drivers start with 200 in their wallet.
 */
import mongoose from 'mongoose';
import { assertEnv, env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { Cafe, Location, MenuItem, Settings, User } from '../models/index.js';

const SAMPLE_LOCATIONS = [
  { name: 'Male Dorm – Block A', type: 'dorm', deliveryFee: 15, sortOrder: 1, driverGender: 'male', description: 'Male drivers only' },
  { name: 'Male Dorm – Block B', type: 'dorm', deliveryFee: 15, sortOrder: 2, driverGender: 'male', description: 'Male drivers only' },
  { name: 'Female Dorm – Block C', type: 'dorm', deliveryFee: 15, sortOrder: 3, driverGender: 'female', description: 'Female drivers only' },
  { name: 'Main Library', type: 'library', deliveryFee: 10, sortOrder: 4, description: 'Main entrance' },
  { name: 'Engineering Building', type: 'academic', deliveryFee: 10, sortOrder: 5 },
  { name: 'Main Gate', type: 'gate', deliveryFee: 10, sortOrder: 6 },
];

async function seedDemo() {
  const users = [
    { telegramId: 1000001, firstName: 'Cafe', fullName: 'Demo Cafe Owner', username: 'demo_owner', phone: '0911000001', role: 'cafe_owner' },
    { telegramId: 1000002, firstName: 'Student', fullName: 'Demo Student', username: 'demo_student', phone: '0911000002', role: 'customer', userType: 'student', onboarded: true },
    {
      telegramId: 1000003,
      firstName: 'Driver',
      fullName: 'Demo Driver',
      username: 'demo_driver',
      phone: '0911000003',
      role: 'driver',
      gender: 'male',
      driverProfile: { status: 'approved', idNumber: 'UGR/0000/15', appliedAt: new Date(), isOnline: true, walletBalance: 200 },
    },
    {
      telegramId: 1000005,
      firstName: 'Hana',
      fullName: 'Demo Female Driver',
      username: 'demo_driver_f',
      phone: '0911000005',
      role: 'driver',
      gender: 'female',
      language: 'am',
      driverProfile: { status: 'approved', idNumber: 'UGR/0001/15', appliedAt: new Date(), isOnline: true, walletBalance: 200 },
    },
    { telegramId: 1000004, firstName: 'Admin', fullName: 'Demo Admin', username: 'demo_admin', phone: '0911000004', role: 'admin' },
  ];
  for (const u of users) {
    if (!(await User.exists({ telegramId: u.telegramId }))) await User.create(u);
  }
  const owner = await User.findOne({ telegramId: 1000001 });

  let cafe = await Cafe.findOne({ owner: owner._id });
  if (!cafe) {
    cafe = await Cafe.create({
      owner: owner._id,
      name: 'Demo Cafe',
      description: 'Fresh breakfast, lunch and juice',
      phone: '0911000001',
      campusSpot: 'Behind the main library',
      openingTime: '00:00',
      closingTime: '00:00', // same time = open 24h for testing
      status: 'approved',
    });
    await MenuItem.insertMany([
      { cafe: cafe._id, name: 'Shiro', category: 'Lunch', price: 90, description: 'With injera', options: [{ name: 'Extra injera', price: 15 }] },
      { cafe: cafe._id, name: 'Firfir', category: 'Breakfast', price: 70, options: [{ name: 'Add egg', price: 15 }] },
      { cafe: cafe._id, name: 'Chechebsa', category: 'Breakfast', price: 80, options: [{ name: 'Extra honey', price: 10 }] },
      { cafe: cafe._id, name: 'Beef burger', category: 'Fast food', price: 180, options: [{ name: 'Extra cheese', price: 20 }, { name: 'Fries', price: 40 }] },
      { cafe: cafe._id, name: 'Avocado juice', category: 'Drinks', price: 60 },
      { cafe: cafe._id, name: 'Macchiato', category: 'Drinks', price: 30 },
    ]);
  }
  owner.cafe = cafe._id;
  await owner.save();
  console.log('✅ Demo users, cafe and menu ready (Telegram IDs 1000001–1000005)');
}

async function main() {
  assertEnv();
  await connectDB();
  await Settings.getSettings();
  console.log('✅ Settings ready');

  if ((await Location.countDocuments()) === 0) {
    await Location.insertMany(SAMPLE_LOCATIONS);
    console.log(`✅ Added ${SAMPLE_LOCATIONS.length} sample locations – edit them in Admin → Locations`);
  } else {
    console.log('ℹ️  Locations already exist, skipped');
  }

  if (process.argv.includes('--demo')) {
    if (env.isProd) console.warn('⚠️  Seeding demo data in production!');
    await seedDemo();
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
