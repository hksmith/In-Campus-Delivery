import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { useT } from '../../i18n/index.js';
import { Async, Empty, Rating, StatusBadge } from '../../components/ui.jsx';
import { useSocketEvent } from '../../lib/socket.js';

export function CafeCard({ cafe }) {
  const t = useT();
  return (
    <Link to={`/cafes/${cafe._id}`} className={`cafe-card ${cafe.isOpen ? '' : 'cafe-card--closed'}`}>
      {cafe.logo ? <img src={cafe.logo} alt="" className="cafe-card__logo" /> : <div className="cafe-card__logo">🍽</div>}
      <div className="cafe-card__body">
        <div className="row row--between">
          <strong>{cafe.name}</strong>
          <span className={`dot ${cafe.isOpen ? 'dot--ok' : 'dot--bad'}`}>{cafe.isOpen ? t('home.open') : t('home.closed')}</span>
        </div>
        {cafe.description && <div className="muted small clamp">{cafe.description}</div>}
        <div className="row row--wrap small muted">
          <Rating value={cafe.rating} count={cafe.ratingCount} />
          <span>· {t('home.min', { n: cafe.prepTimeMinutes })}</span>
          <span>
            · {cafe.openingTime}–{cafe.closingTime}
          </span>
        </div>
        {cafe.area && (
          <div className="small muted">
            📍 {cafe.area.name} · 🛵 {t('home.deliveryFrom', { fee: money(cafe.area.deliveryFee) })}
          </div>
        )}
      </div>
    </Link>
  );
}

function ActiveOrdersStrip() {
  const t = useT();
  const { data, reload } = useApi('/orders', { params: { scope: 'active' } });
  useSocketEvent('order:updated', () => reload());
  const orders = data?.orders || [];
  if (!orders.length) return null;
  return (
    <div className="stack">
      {orders.map((o) => (
        <Link key={o._id} to={`/orders/${o._id}`} className="active-order">
          <div>
            <strong>#{o.orderNumber}</strong> · {o.cafe?.name}
            <div className="muted small">
              {money(o.total)} · {t('home.tapToTrack')}
            </div>
          </div>
          <StatusBadge status={o.status} />
        </Link>
      ))}
    </div>
  );
}

export default function Home() {
  const t = useT();
  const { user, settings } = useAuth();
  const cart = useCart();
  const { data, loading, error, reload } = useApi('/cafes');
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);

  // Debounced search across cafes and dishes
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const { data: res } = await api.get('/cafes/search', { params: { q } });
        setResults(res);
      } catch {
        setResults({ cafes: [], items: [] });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="page stack">
      <div>
        <h2 className="greeting">{t('home.hi', { name: user.firstName || user.fullName?.split(' ')[0] || '' })}</h2>
        <p className="muted">{t('home.what')}</p>
      </div>

      {settings?.announcement && <div className="banner banner--info">📢 {settings.announcement}</div>}

      <ActiveOrdersStrip />

      <input className="input input--search" placeholder={t('home.search')} value={q} onChange={(e) => setQ(e.target.value)} />

      {results ? (
        <div className="stack">
          {results.cafes.map((c) => (
            <CafeCard key={c._id} cafe={c} />
          ))}
          {results.items.map((i) => (
            <Link key={i._id} to={`/cafes/${i.cafe?._id}`} className="list-link">
              <span>
                {i.name}
                <span className="muted small block">{i.cafe?.name}</span>
              </span>
              <strong>{money(i.price)}</strong>
            </Link>
          ))}
          {!results.cafes.length && !results.items.length && <Empty icon="🔍" text={t('home.nothingFound')} />}
        </div>
      ) : (
        <Async loading={loading} error={error} reload={reload}>
          {data?.cafes?.length ? (
            <div className="stack">
              <h3 className="section-title">{t('home.cafes')}</h3>
              {data.cafes.map((c) => (
                <CafeCard key={c._id} cafe={c} />
              ))}
            </div>
          ) : (
            <Empty icon="🏪" title={t('home.noCafes')} text={t('home.noCafesText')} />
          )}
        </Async>
      )}

      {cart.count > 0 && (
        <Link to="/cart" className="floating-cart">
          <span>
            🛒 {t('common.items', { n: cart.count })} · {cart.cafe?.name}
          </span>
          <strong>{money(cart.subtotal)}</strong>
        </Link>
      )}
    </div>
  );
}
