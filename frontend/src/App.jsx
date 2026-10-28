import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { isInTelegram } from './lib/telegram.js';
import { getDevTelegramId } from './lib/api.js';
import { ROLE_HOME } from './lib/constants.js';
import { useT } from './i18n/index.js';
import Layout from './components/Layout.jsx';
import { Loader } from './components/ui.jsx';

import Onboarding from './pages/shared/Onboarding.jsx';
import Profile from './pages/shared/Profile.jsx';
import ApplyDriver from './pages/shared/ApplyDriver.jsx';
import RegisterCafe from './pages/shared/RegisterCafe.jsx';
import { BlockedScreen, NotInTelegram } from './pages/shared/Screens.jsx';

import Home from './pages/customer/Home.jsx';
import CafeMenu from './pages/customer/CafeMenu.jsx';
import Cart from './pages/customer/Cart.jsx';
import Orders from './pages/customer/Orders.jsx';
import OrderDetail from './pages/customer/OrderDetail.jsx';

import CafeOrders from './pages/cafe/CafeOrders.jsx';
import CafeMenuManager from './pages/cafe/CafeMenuManager.jsx';
import MenuItemForm from './pages/cafe/MenuItemForm.jsx';
import CafeStats from './pages/cafe/CafeStats.jsx';
import CafeSettings from './pages/cafe/CafeSettings.jsx';

import DriverAvailable from './pages/driver/DriverAvailable.jsx';
import DriverActive from './pages/driver/DriverActive.jsx';
import DriverEarnings from './pages/driver/DriverEarnings.jsx';

import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminOrders from './pages/admin/AdminOrders.jsx';
import AdminPeople from './pages/admin/AdminPeople.jsx';
import AdminMoney from './pages/admin/AdminMoney.jsx';
import AdminMore from './pages/admin/AdminMore.jsx';
import AdminLocations from './pages/admin/AdminLocations.jsx';
import AdminSettings from './pages/admin/AdminSettings.jsx';
import AdminBroadcast from './pages/admin/AdminBroadcast.jsx';

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

  // When a cafe owner / driver / admin opens the app, start on their dashboard
  useEffect(() => {
    if (!user || redirected.current) return;
    redirected.current = true;
    if (pathname === '/' && user.role !== 'customer' && user.isProfileComplete) {
      navigate(ROLE_HOME[user.role], { replace: true });
    }
  }, [user, pathname, navigate]);

  if (!isInTelegram && !getDevTelegramId()) return <NotInTelegram />;
  if (loading) return <Loader full label={t('common.opening')} />;
  if (errorCode === 'BANNED' || errorCode === 403) return <BlockedScreen message={error} />;
  if (error || !user) return <BlockedScreen message={error || t('screen.couldNotLoad')} onRetry={refresh} />;
  if (!user.isProfileComplete) return <Onboarding />;

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

          {/* Admin */}
          <Route path="/admin" element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>} />
          <Route path="/admin/orders" element={<RequireRole roles={['admin']}><AdminOrders /></RequireRole>} />
          <Route path="/admin/people" element={<RequireRole roles={['admin']}><AdminPeople /></RequireRole>} />
          <Route path="/admin/money" element={<RequireRole roles={['admin']}><AdminMoney /></RequireRole>} />
          <Route path="/admin/more" element={<RequireRole roles={['admin']}><AdminMore /></RequireRole>} />
          <Route path="/admin/locations" element={<RequireRole roles={['admin']}><AdminLocations /></RequireRole>} />
          <Route path="/admin/settings" element={<RequireRole roles={['admin']}><AdminSettings /></RequireRole>} />
          <Route path="/admin/broadcast" element={<RequireRole roles={['admin']}><AdminBroadcast /></RequireRole>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
