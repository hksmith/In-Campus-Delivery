import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction, useTicker } from '../../lib/hooks.js';
import { money, timeAgo, placeName } from '../../lib/format.js';
import { useSocketEvent } from '../../lib/socket.js';
import { haptic } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/index.js';
import { Async, Empty, GenderTag, StatusBadge, Toggle } from '../../components/ui.jsx';

export function OnlineSwitch() {
  const t = useT();
  const { user, setUser } = useAuth();
  const [busy, run] = useAction();
  const online = user.driverProfile?.isOnline;
  const toggle = (isOnline) =>
    run(async () => {
      const { data } = await api.patch('/driver/status', { isOnline });
      setUser(data.user);
      haptic.success();
    });
  return (
    <div className={`card row row--between ${online ? 'card--ok' : ''}`}>
      <div>
        <strong>{online ? t('drv.online') : t('drv.offline')}</strong>
        <div className="muted small">{online ? t('drv.onlineSub') : t('drv.offlineSub')}</div>
      </div>
      <Toggle checked={online} disabled={busy} onChange={toggle} />
    </div>
  );
}

/** Pickup → drop-off box used on driver cards */
export function Route({ order }) {
  const t = useT();
  return (
    <div className="route">
      <div>
        <span className="muted small">{t('drv.pickup')}</span>
        <strong>{order.cafe?.name}</strong>
        {order.cafe?.campusSpot && <span className="muted small">{order.cafe.campusSpot}</span>}
      </div>
      <div className="route__arrow">→</div>
      <div>
        <span className="muted small">{t('drv.deliverTo')}</span>
        <strong>{placeName(order.delivery)}</strong>
        {order.delivery?.details && <span className="muted small">{order.delivery.details}</span>}
        <GenderTag only={order.delivery?.driverGender} />
      </div>
    </div>
  );
}

export default function DriverAvailable() {
  const t = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  useTicker(30000);
  const { data, loading, error, reload } = useApi('/driver/available');
  const [busy, run] = useAction();

  useSocketEvent('pool:changed', () => reload());
  useSocketEvent('pool:new', () => {
    haptic.warning();
    reload();
  });
  useSocketEvent('me:updated', () => reload());

  const claim = (order) =>
    run(async () => {
      await api.post(`/driver/orders/${order._id}/claim`);
      haptic.success();
      toast.success(t('drv.yours', { n: order.orderNumber }));
      navigate('/driver/active');
    });

  const online = user.driverProfile?.isOnline;
  const wallet = data?.wallet;
  const orders = data?.orders || [];
  const cheapest = orders.length ? Math.min(...orders.map((o) => o.platformEarning || 0)) : 0;
  const walletLow = wallet && orders.length > 0 && wallet.available < cheapest;

  return (
    <div className="page stack">
      <OnlineSwitch />
      {wallet && (walletLow || wallet.available <= 0 || wallet.isLow) && (
        <div className="banner banner--warn row row--between">
          <span>{t('drv.walletLow', { amount: money(Math.max(0, wallet.available)) })}</span>
          <Link to="/driver/earnings" className="btn btn--sm">
            {t('drv.topUpNow')}
          </Link>
        </div>
      )}
      <h2>{t('drv.availableTitle')}</h2>
      <Async loading={loading} error={error} reload={reload}>
        {orders.length ? (
          <div className="stack">
            {orders.map((o) => {
              const affordable = !wallet || wallet.available >= (o.platformEarning || 0);
              return (
                <div key={o._id} className="card stack stack--sm">
                  <div className="row row--between">
                    <strong>#{o.orderNumber}</strong>
                    <StatusBadge status={o.status} />
                  </div>
                  <Route order={o} />
                  <div className="small muted">
                    {t('drv.collect', { n: o.items.reduce((s, i) => s + i.quantity, 0), amount: money(o.total) })} ·{' '}
                    {timeAgo(o.acceptedAt)}
                  </div>
                  <div className="small">
                    💵 {t('drv.payCafe', { amount: money(o.cafePayout) })} · {t('drv.fee', { amount: money(o.platformEarning) })}
                  </div>
                  <button className="btn btn--block" disabled={busy || !online || !affordable} onClick={() => claim(o)}>
                    {affordable ? t('drv.take', { amount: money(o.driverEarning) }) : t('drv.cantAfford')}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon="📦" title={t('drv.none')} text={t('drv.noneText')} />
        )}
      </Async>
    </div>
  );
}
