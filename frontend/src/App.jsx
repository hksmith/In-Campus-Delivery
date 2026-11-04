import { lazy, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { isInTelegram } from './lib/telegram.js';
import { getDevTelegramId } from './lib/api.js';
import { ROLE_HOME } from './lib/constants.js';
import { useT } from './i18n/index.js';
import Layout from './components/Layout.jsx';
import { Loader } from './components/ui.jsx';

// Shop screens load with the app; cafe, driver and admin screens (and the sign-up forms)
// download only when someone opens them, so students get a smaller, faster app.
import Onboarding from './pages/shared/Onboarding.jsx';
import ChooseStart from './pages/shared/ChooseStart.jsx';
import Profile from './pages/shared/Profile.jsx';
/**
 * Like React.lazy, but if a new version was deployed while the app was open (old files gone),
 * reload once to get the new version instead of showing an error.
 */
function lazyPage(load) {
  return lazy(() =>
    load()
      .then((mod) => {
        try {
          sessionStorage.removeItem('chunkReload'); // loaded fine – a later deploy may reload again
        } catch {
          /* storage blocked */
        }
        return mod;
      })
      .catch((err) => {
      let reloaded = false;
      try {
        reloaded = sessionStorage.getItem('chunkReload') === '1';
        if (!reloaded) sessionStorage.setItem('chunkReload', '1');
      } catch {
        /* storage blocked */
      }
      if (!reloaded) {
        window.location.reload();
        return new Promise(() => {});
      }
      throw err;
    })
  );
}

/** Start downloading a role's dashboard screens as soon as we know who opened the app */
const PREFETCH = {
  driver: () => [import('./pages/driver/DriverAvailable.jsx'), import('./pages/driver/DriverActive.jsx')],
  cafe_owner: () => [import('./pages/cafe/CafeOrders.jsx'), import('./pages/cafe/CafeMenuManager.jsx')],
  cafe_staff: () => [import('./pages/cafe/CafeOrders.jsx'), import('./pages/cafe/CafeMenuManager.jsx')],
  admin: () => [import('./pages/admin/AdminDashboard.jsx'), import('./pages/admin/AdminOrders.jsx'), import('./pages/admin/AdminPeople.jsx')],
};

const ApplyDriver = lazyPage(() => import('./pages/shared/ApplyDriver.jsx'));
const RegisterCafe = lazyPage(() => import('./pages/shared/RegisterCafe.jsx'));
import { BlockedScreen, NotInTelegram } from './pages/shared/Screens.jsx';

import Home from './pages/customer/Home.jsx';
import CafeMenu from './pages/customer/CafeMenu.jsx';
import Cart from './pages/customer/Cart.jsx';
import Orders from './pages/customer/Orders.jsx';
import OrderDetail from './pages/customer/OrderDetail.jsx';

const CafeOrders = lazyPage(() => import('./pages/cafe/CafeOrders.jsx'));
const CafeMenuManager = lazyPage(() => import('./pages/cafe/CafeMenuManager.jsx'));
const MenuItemForm = lazyPage(() => import('./pages/cafe/MenuItemForm.jsx'));
const CafeStats = lazyPage(() => import('./pages/cafe/CafeStats.jsx'));
const CafeSettings = lazyPage(() => import('./pages/cafe/CafeSettings.jsx'));

const DriverAvailable = lazyPage(() => import('./pages/driver/DriverAvailable.jsx'));
const DriverActive = lazyPage(() => import('./pages/driver/DriverActive.jsx'));
const DriverEarnings = lazyPage(() => import('./pages/driver/DriverEarnings.jsx'));

const AdminDashboard = lazyPage(() => import('./pages/admin/AdminDashboard.jsx'));
const AdminOrders = lazyPage(() => import('./pages/admin/AdminOrders.jsx'));
const AdminPeople = lazyPage(() => import('./pages/admin/AdminPeople.jsx'));
const AdminMoney = lazyPage(() => import('./pages/admin/AdminMoney.jsx'));
const AdminMore = lazyPage(() => import('./pages/admin/AdminMore.jsx'));
const AdminAreas = lazyPage(() => import('./pages/admin/AdminAreas.jsx'));
const AdminSettings = lazyPage(() => import('./pages/admin/AdminSettings.jsx'));
const AdminBroadcast = lazyPage(() => import('./pages/admin/AdminBroadcast.jsx'));

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role] || '/'} replace />;
  return children;
}

const CAFE = ['cafe_owner', 'cafe_staff'];

export default function App() {
  const t = useT();
  const { user, loading, error, errorCode, refresh } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const redirected = useRef(false);

  useEffect(() => {
    if (!user?.role || !PREFETCH[user.role]) return;
    Promise.all(PREFETCH[user.role]()).catch(() => {});
  }, [user?.role]);

  // When a cafe owner / driver / admin opens the app, start on their dashboard
  useEffect(() => {
    // Wait until the profile is set up, so first-time admins/owners/drivers also land on their dashboard
    if (!user || !user.isProfileComplete || redirected.current) return;
    redirected.current = true;
    if (pathname === '/' && user.role !== 'customer') {
      navigate(ROLE_HOME[user.role], { replace: true });
    }
  }, [user, pathname, navigate]);

  if (!isInTelegram && !getDevTelegramId()) return <NotInTelegram />;
  if (loading) return <Loader full label={t('common.opening')} />;
  if (errorCode === 'BANNED' || errorCode === 403) return <BlockedScreen message={error} />;
  if (error || !user) return <BlockedScreen message={error || t('screen.couldNotLoad')} onRetry={refresh} />;
  // Step 1: everyone enters name + phone
  if (!user.isProfileComplete) return <Onboarding />;
  // Step 2: regular users choose what they want to do (order / deliver / own a cafe).
  // Admins, cafe accounts and drivers skip this and go to their dashboard.
  if (user.role === 'customer' && !user.onboarded) return <ChooseStart />;

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          {/* Shop – every role can order food */}
          <Route path="/" element={<Home />} />
          <Route path="/cafes/:id" element={<CafeMenu />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/apply/driver" element={<ApplyDriver />} />
          <Route path="/apply/cafe" element={<RegisterCafe />} />

          {/* Cafe owner & staff */}
          <Route path="/cafe/orders" element={<RequireRole roles={CAFE}><CafeOrders /></RequireRole>} />
          <Route path="/cafe/menu" element={<RequireRole roles={CAFE}><CafeMenuManager /></RequireRole>} />
          <Route path="/cafe/menu/new" element={<RequireRole roles={['cafe_owner']}><MenuItemForm /></RequireRole>} />
          <Route path="/cafe/menu/:itemId" element={<RequireRole roles={['cafe_owner']}><MenuItemForm /></RequireRole>} />
          <Route path="/cafe/stats" element={<RequireRole roles={['cafe_owner']}><CafeStats /></RequireRole>} />
          <Route path="/cafe/settings" element={<RequireRole roles={['cafe_owner']}><CafeSettings /></RequireRole>} />

          {/* Driver */}
          <Route path="/driver" element={<RequireRole roles={['driver']}><DriverAvailable /></RequireRole>} />
          <Route path="/driver/active" element={<RequireRole roles={['driver']}><DriverActive /></RequireRole>} />
          <Route path="/driver/earnings" element={<RequireRole roles={['driver']}><DriverEarnings /></RequireRole>} />
          {/* Ratings now live in My trips → Ratings tab; old links still work */}
          <Route path="/driver/ratings" element={<Navigate to="/driver/active?tab=ratings" replace />} />

          {/* Admin */}
          <Route path="/admin" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
          <Route path="/admin/orders" element={<RequireRole roles={['admin']}><AdminOrders /></RequireRole>} />
          <Route path="/admin/people" element={<RequireRole roles={['admin']}><AdminPeople /></RequireRole>} />
          <Route path="/admin/money" element={<RequireRole roles={['admin']}><AdminMoney /></RequireRole>} />
          <Route path="/admin/more" element={<RequireRole roles={['admin']}><AdminMore /></RequireRole>} />
          <Route path="/admin/areas" element={<RequireRole roles={['admin']}><AdminAreas /></RequireRole>} />
          <Route path="/admin/settings" element={<RequireRole roles={['admin']}><AdminSettings /></RequireRole>} />
          <Route path="/admin/broadcast" element={<RequireRole roles={['admin']}><AdminBroadcast /></RequireRole>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
