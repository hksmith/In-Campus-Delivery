import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction, useTicker } from '../../lib/hooks.js';
import { money, timeAgo, placeName } from '../../lib/format.js';
import { useSocketEvent } from '../../lib/socket.js';
import { haptic } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/index.js';
import Icon from '../../components/Icon.jsx';
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
    <div className={`online-card ${online ? 'online-card--on' : ''}`}>
      <span className="online-card__icon">
        <Icon name="bike" size={22} />
      </span>
      <div className="online-card__text">
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
      <span className="route__pt route__pt--a" />
      <div>
        <span className="muted small">{t('drv.pickup')}</span>
        <strong>{order.cafe?.name}</strong>
        {order.cafe?.campusSpot && <span className="muted small">{order.cafe.campusSpot}</span>}
      </div>
      <span className="route__pt route__pt--b" />
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
        <div className="banner banner--warn row row--between announce" style={{ alignItems: 'center' }}>
          <span className="announce__icon">💵</span>
          <span style={{ flex: 1 }}>{t('drv.walletLow', { amount: money(Math.max(0, wallet.available)) })}</span>
          <Link to="/driver/earnings" className="btn btn--sm">
            {t('drv.topUpNow')}
          </Link>
        </div>
      )}
      <div className="page-head">
        <h3 className="section-title" style={{ margin: 0 }}>{t('drv.availableTitle')}</h3>
        {orders.length > 0 && <span className="badge badge--accent">{orders.length}</span>}
      </div>
      <Async loading={loading} error={error} reload={reload}>
        {orders.length ? (
          <div className="stack">
            {orders.map((o) => {
              const affordable = !wallet || wallet.available >= (o.platformEarning || 0);
              return (
                <div key={o._id} className="card">
                  <div className="row row--between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="row">
                        <strong>#{o.orderNumber}</strong>
                        <StatusBadge status={o.status} />
                      </div>
                      <div className="muted small" style={{ marginTop: 3 }}>
                        {t('drv.collect', { n: o.items.reduce((s, i) => s + i.quantity, 0), amount: money(o.total) })} · {timeAgo(o.acceptedAt)}
                      </div>
                    </div>
                    <div className="job-card__earn">
                      <strong>+{money(o.driverEarning)}</strong>
                    </div>
                  </div>
                  <Route order={o} />
                  <div className="pills">
                    <span className="badge badge--grey">💵 {t('drv.payCafe', { amount: money(o.cafePayout) })}</span>
                    <span className="badge badge--grey">{t('drv.fee', { amount: money(o.platformEarning) })}</span>
                  </div>
                  <button className="btn btn--block btn--lg" disabled={busy || !online || !affordable} onClick={() => claim(o)}>
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
