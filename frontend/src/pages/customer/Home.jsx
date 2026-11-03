import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { useT } from '../../i18n/index.js';
import { Async, Empty, FloatingCart, Rating, SearchInput, StatusBadge } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { TopBar } from '../../components/Layout.jsx';
import { TRACK_STEPS } from '../../lib/constants.js';
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
        <div className="meta">
          <Rating value={cafe.rating} count={cafe.ratingCount} />
          <span>
            <Icon name="clock" size={13} />
            {t('home.min', { n: cafe.prepTimeMinutes })}
          </span>
          <span>
            {cafe.openingTime}–{cafe.closingTime}
          </span>
        </div>
        {cafe.area && (
          <div className="meta">
            <span>
              <Icon name="pin" size={13} />
              {cafe.area.name}
            </span>
            <span>
              <Icon name="bike" size={14} />
              {t('home.deliveryFrom', { fee: money(cafe.area.deliveryFee) })}
            </span>
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
    <div className="stack stack--sm">
      {orders.map((o) => {
        const step = TRACK_STEPS.indexOf(o.status);
        return (
          <Link key={o._id} to={`/orders/${o._id}`} className="active-order">
            <div className="active-order__top">
              <div style={{ minWidth: 0 }}>
                <strong>
                  #{o.orderNumber} · {o.cafe?.name}
                </strong>
                <div className="muted small">
                  {money(o.total)} · {t('home.tapToTrack')}
                </div>
              </div>
              <StatusBadge status={o.status} />
            </div>
            <div className="progress">
              {TRACK_STEPS.slice(1).map((s, i) => (
                <span key={s} className={i < step ? 'on' : ''} />
              ))}
            </div>
          </Link>
        );
      })}
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
    <>
      <div className="hero">
        <TopBar hero />
        <div className="hero__greet">
          <h2 className="greeting">{t('home.hi', { name: user.firstName || user.fullName?.split(' ')[0] || '' })}</h2>
          <p>{t('home.what')}</p>
        </div>
        <SearchInput placeholder={t('home.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="page stack">
        {settings?.announcement && (
          <div className="banner banner--info announce">
            <span className="announce__icon">📢</span>
            <span>{settings.announcement}</span>
          </div>
        )}

        <ActiveOrdersStrip />

        {results ? (
          <div className="stack stack--sm">
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
              <div className="stack stack--sm">
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
          <FloatingCart
            count={cart.count}
            title={cart.cafe?.name}
            subtitle={t('common.items', { n: cart.count })}
            total={money(cart.subtotal)}
          />
        )}
      </div>
    </>
  );
}
