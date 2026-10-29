import { Router } from 'express';
import multer from 'multer';
import { ah } from '../utils/helpers.js';
import { ApiError } from '../utils/ApiError.js';
import { authenticate, requireActiveDriver, requireProfile, requireRole } from '../middleware/auth.js';
import { uploadImage } from '../services/uploadService.js';

import * as auth from '../controllers/authController.js';
import * as users from '../controllers/userController.js';
import * as areas from '../controllers/areaController.js';
import * as cafes from '../controllers/cafeController.js';
import * as orders from '../controllers/orderController.js';
import * as myCafe from '../controllers/myCafeController.js';
import * as driver from '../controllers/driverController.js';
import * as admin from '../controllers/adminController.js';

const router = Router();
router.use(authenticate);

// ── Auth / profile ──
router.get('/auth/me', ah(auth.me));
router.patch('/users/me', ah(users.updateMe));
router.post('/users/me/start', ah(users.chooseStart));
router.post('/users/me/driver-application', ah(users.applyAsDriver));
router.get('/users/me/cafe-application', ah(users.myCafeApplication));

// ── Image upload (menu photos, logos, ID cards) ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(ApiError.badRequest('Only images are allowed')),
});
router.post(
  '/uploads/image',
  upload.single('image'),
  ah(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No image received');
    const url = await uploadImage(req.file.buffer);
    res.status(201).json({ url });
  })
);

// ── Customer ──
router.get('/areas', ah(areas.listActive));
router.get('/cafes', ah(cafes.listCafes));
router.get('/cafes/search', ah(cafes.search));
router.post('/cafes/apply', ah(cafes.applyCafe));
router.get('/cafes/:id', ah(cafes.getCafe));
router.get('/cafes/:id/reviews', ah(cafes.getCafeReviews));

router.post('/orders', requireProfile, ah(orders.createOrder));
router.get('/orders', ah(orders.myOrders));
router.get('/orders/:id', ah(orders.getMyOrder));
router.post('/orders/:id/cancel', ah(orders.cancelMyOrder));
router.post('/orders/:id/review', ah(orders.reviewOrder));

// ── Cafe owner & staff ──
const cafeRouter = Router();
cafeRouter.use(myCafe.loadMyCafe);
cafeRouter.get('/', ah(myCafe.getMyCafe));
cafeRouter.patch('/', myCafe.ownerOnly, ah(myCafe.updateMyCafe));
cafeRouter.patch('/accepting', ah(myCafe.setAccepting));

cafeRouter.get('/menu', ah(myCafe.listMenu));
cafeRouter.post('/menu', myCafe.ownerOnly, ah(myCafe.createMenuItem));
cafeRouter.patch('/menu/:itemId', myCafe.ownerOnly, ah(myCafe.updateMenuItem));
cafeRouter.patch('/menu/:itemId/availability', ah(myCafe.setItemAvailability));
cafeRouter.delete('/menu/:itemId', myCafe.ownerOnly, ah(myCafe.deleteMenuItem));

cafeRouter.get('/orders', ah(myCafe.listOrders));
cafeRouter.post('/orders/:id/accept', ah(myCafe.acceptOrder));
cafeRouter.post('/orders/:id/reject', ah(myCafe.rejectOrder));
cafeRouter.post('/orders/:id/preparing', ah(myCafe.markPreparing));
cafeRouter.post('/orders/:id/ready', ah(myCafe.markReady));
cafeRouter.post('/orders/:id/cancel', ah(myCafe.cancelOrder));
cafeRouter.post('/orders/:id/report-unpaid', ah(myCafe.reportUnpaid));

cafeRouter.get('/staff', myCafe.ownerOnly, ah(myCafe.listStaff));
cafeRouter.post('/staff', myCafe.ownerOnly, ah(myCafe.addStaff));
cafeRouter.delete('/staff/:userId', myCafe.ownerOnly, ah(myCafe.removeStaff));

cafeRouter.get('/stats', myCafe.ownerOnly, ah(myCafe.stats));
cafeRouter.get('/reviews', ah(myCafe.listReviews));
cafeRouter.post('/reviews/:reviewId/reply', myCafe.ownerOnly, ah(myCafe.replyReview));
router.use('/my-cafe', cafeRouter);

// ── Driver ──
const driverRouter = Router();
driverRouter.use(requireActiveDriver);
driverRouter.patch('/status', ah(driver.setOnline));
driverRouter.get('/available', ah(driver.available));
driverRouter.get('/active', ah(driver.active));
driverRouter.get('/history', ah(driver.history));
driverRouter.get('/earnings', ah(driver.earnings));
driverRouter.get('/wallet', ah(driver.wallet));
driverRouter.post('/wallet/topups', ah(driver.topUp));
driverRouter.post('/orders/:id/claim', ah(driver.claim));
driverRouter.post('/orders/:id/release', ah(driver.release));
driverRouter.post('/orders/:id/pickup', ah(driver.pickup));
driverRouter.post('/orders/:id/deliver', ah(driver.deliver));
router.use('/driver', driverRouter);

// ── Admin ──
const adminRouter = Router();
adminRouter.use(requireRole('admin'));
adminRouter.get('/stats', ah(admin.stats));

adminRouter.get('/orders', ah(admin.listOrders));
adminRouter.post('/orders/:id/cancel', ah(admin.cancelOrder));
adminRouter.post('/orders/:id/release-driver', ah(admin.releaseDriver));
adminRouter.post('/orders/:id/assign', ah(admin.assignDriver));
adminRouter.post('/orders/:id/force-deliver', ah(admin.forceDeliver));

adminRouter.get('/cafes', ah(admin.listCafes));
adminRouter.patch('/cafes/:id/status', ah(admin.setCafeStatus));
adminRouter.patch('/cafes/:id/commission', ah(admin.setCafeCommission));
adminRouter.patch('/cafes/:id/area', ah(areas.setCafeArea));
adminRouter.get('/drivers', ah(admin.listDrivers));
adminRouter.patch('/drivers/:id/status', ah(admin.setDriverStatus));
adminRouter.get('/users', ah(admin.listUsers));
adminRouter.patch('/users/:id', ah(admin.updateUser));


adminRouter.get('/areas', ah(areas.listAll));
adminRouter.post('/areas', ah(areas.create));
adminRouter.patch('/areas/:id', ah(areas.update));
adminRouter.delete('/areas/:id', ah(areas.remove));

adminRouter.get('/settings', ah(admin.getSettings));
adminRouter.patch('/settings', ah(admin.updateSettings));

adminRouter.get('/topups', ah(admin.listTopUps));
adminRouter.post('/topups/:id/approve', ah(admin.approveTopUp));
adminRouter.post('/topups/:id/reject', ah(admin.rejectTopUp));
adminRouter.post('/topups/:id/recheck', ah(admin.recheckTopUp));
adminRouter.get('/wallets', ah(admin.listWallets));
adminRouter.get('/wallets/:id', ah(admin.driverLedger));
adminRouter.post('/wallets/:id/adjust', ah(admin.adjustWallet));
adminRouter.post('/orders/:id/resolve-issue', ah(admin.resolvePickupIssue));

adminRouter.post('/broadcast', ah(admin.broadcast));
router.use('/admin', adminRouter);

export default router;
