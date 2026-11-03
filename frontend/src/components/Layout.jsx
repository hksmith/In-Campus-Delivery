import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { ROLE_HOME } from '../lib/constants.js';
import { useT } from '../i18n/index.js';
import LanguageSwitch from './LanguageSwitch.jsx';
import Icon from './Icon.jsx';

const NAVS = {
  customer: [
    { to: '/', label: 'nav.home', icon: 'home', end: true },
    { to: '/orders', label: 'nav.orders', icon: 'receipt' },
    { to: '/cart', label: 'nav.cart', icon: 'bag', cart: true },
    { to: '/profile', label: 'nav.profile', icon: 'user' },
  ],
  cafe_owner: [
    { to: '/cafe/orders', label: 'nav.orders', icon: 'receipt' },
    { to: '/cafe/menu', label: 'nav.menu', icon: 'menu' },
    { to: '/cafe/stats', label: 'nav.stats', icon: 'chart' },
    { to: '/cafe/settings', label: 'nav.settings', icon: 'settings' },
  ],
  cafe_staff: [
    { to: '/cafe/orders', label: 'nav.orders', icon: 'receipt' },
    { to: '/cafe/menu', label: 'nav.menu', icon: 'menu' },
    { to: '/profile', label: 'nav.profile', icon: 'user' },
  ],
  driver: [
    { to: '/driver', label: 'nav.available', icon: 'box', end: true },
    { to: '/driver/active', label: 'nav.trips', icon: 'bike' },
    { to: '/driver/earnings', label: 'nav.wallet', icon: 'wallet' },
    { to: '/profile', label: 'nav.profile', icon: 'user' },
  ],
  admin: [
    { to: '/admin', label: 'nav.home', icon: 'grid', end: true },
    { to: '/admin/orders', label: 'nav.orders', icon: 'receipt' },
    { to: '/admin/people', label: 'nav.people', icon: 'users' },
    { to: '/admin/money', label: 'nav.wallets', icon: 'wallet' },
    { to: '/admin/more', label: 'nav.more', icon: 'settings' },
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

/** Logo + app name, the Order food / Dashboard switch and the language switch */
export function TopBar({ hero = false }) {
  const t = useT();
  const { user, config } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const inShop = areaFor(pathname, user.role) === 'customer';
  const isWorker = user.role !== 'customer';

  return (
    <header className={`topbar ${hero ? 'topbar--hero' : ''}`}>
      <div className="topbar__brand" onClick={() => navigate(inShop ? '/' : ROLE_HOME[user.role])}>
        <span className="topbar__logo">🍔</span>
        <div style={{ minWidth: 0 }}>
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
  );
}

/** Pages that draw their own header (orange hero on Home, cover photo on a cafe) */
const OWN_HEADER = [/^\/$/, /^\/cafes\/[^/]+$/];

export default function Layout() {
  const t = useT();
  const { user, settings } = useAuth();
  const { count } = useCart();
  const { pathname } = useLocation();

  const area = areaFor(pathname, user.role);
  const inShop = area === 'customer';
  const ownHeader = OWN_HEADER.some((re) => re.test(pathname));

  return (
    <div className={`app ${ownHeader ? 'app--hero' : ''}`}>
      {!ownHeader && <TopBar />}

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
              <Icon name={item.icon} size={21} />
              {item.cart && count > 0 && <span className="bottomnav__badge">{count}</span>}
            </span>
            <span>{t(item.label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
