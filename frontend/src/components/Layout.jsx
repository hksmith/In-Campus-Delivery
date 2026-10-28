import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { ROLE_HOME } from '../lib/constants.js';
import { useT } from '../i18n/index.js';
import LanguageSwitch from './LanguageSwitch.jsx';

const NAVS = {
  customer: [
    { to: '/', label: 'nav.home', icon: '🏠', end: true },
    { to: '/orders', label: 'nav.orders', icon: '🧾' },
    { to: '/cart', label: 'nav.cart', icon: '🛒', cart: true },
    { to: '/profile', label: 'nav.profile', icon: '👤' },
  ],
  cafe_owner: [
    { to: '/cafe/orders', label: 'nav.orders', icon: '🧾' },
    { to: '/cafe/menu', label: 'nav.menu', icon: '📋' },
    { to: '/cafe/stats', label: 'nav.stats', icon: '📊' },
    { to: '/cafe/settings', label: 'nav.settings', icon: '⚙️' },
  ],
  cafe_staff: [
    { to: '/cafe/orders', label: 'nav.orders', icon: '🧾' },
    { to: '/cafe/menu', label: 'nav.menu', icon: '📋' },
    { to: '/profile', label: 'nav.profile', icon: '👤' },
  ],
  driver: [
    { to: '/driver', label: 'nav.available', icon: '📦', end: true },
    { to: '/driver/active', label: 'nav.trips', icon: '🛵' },
    { to: '/driver/earnings', label: 'nav.wallet', icon: '💵' },
    { to: '/profile', label: 'nav.profile', icon: '👤' },
  ],
  admin: [
    { to: '/admin', label: 'nav.home', icon: '📊', end: true },
    { to: '/admin/orders', label: 'nav.orders', icon: '🧾' },
    { to: '/admin/people', label: 'nav.people', icon: '👥' },
    { to: '/admin/money', label: 'nav.wallets', icon: '💵' },
    { to: '/admin/more', label: 'nav.more', icon: '⚙️' },
  ],
};

/** Which navigation to show: the role dashboard, or the shop (everyone can order food) */
function areaFor(pathname, role) {
  if (pathname.startsWith('/cafe') && ['cafe_owner', 'cafe_staff'].includes(role)) return role;
  if (pathname.startsWith('/driver') && role === 'driver') return 'driver';
  if (pathname.startsWith('/admin') && role === 'admin') return 'admin';
  if (pathname === '/profile' && role !== 'customer' && role !== 'admin') return role;
  return 'customer';
}

export default function Layout() {
  const t = useT();
  const { user, config, settings } = useAuth();
  const { count } = useCart();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const area = areaFor(pathname, user.role);
  const isWorker = user.role !== 'customer';
  const inShop = area === 'customer';

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand" onClick={() => navigate(inShop ? '/' : ROLE_HOME[user.role])}>
          <span className="topbar__logo">🍔</span>
          <div>
            <div className="topbar__title">{config?.appName || 'Campus Eats'}</div>
            <div className="topbar__sub">{config?.universityName}</div>
          </div>
        </div>
        <div className="row">
          {isWorker && (
            <button className="chip" onClick={() => navigate(inShop ? ROLE_HOME[user.role] : '/')}>
              {inShop ? t('nav.dashboard') : t('nav.orderFood')}
            </button>
          )}
          <LanguageSwitch compact />
        </div>
      </header>

      {inShop && settings && !settings.isPlatformOpen && (
        <div className="banner banner--bad">{settings.closedMessage}</div>
      )}

      <main className="content">
        <Outlet />
      </main>

      <nav className="bottomnav">
        {NAVS[area].map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="bottomnav__item">
            <span className="bottomnav__icon">
              {item.icon}
              {item.cart && count > 0 && <span className="bottomnav__badge">{count}</span>}
            </span>
            <span>{t(item.label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
