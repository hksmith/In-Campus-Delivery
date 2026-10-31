import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { dateTime, money, personName, placeName } from '../../lib/format.js';
import { useSocketEvent } from '../../lib/socket.js';
import { callPhone, confirmDialog, haptic, openTelegramUser } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useT } from '../../i18n/index.js';
import { Async, Empty, OrderItems, StatusBadge, Tabs } from '../../components/ui.jsx';
import { Route } from './DriverAvailable.jsx';

function DeliveryCard({ order, onChanged }) {
  const t = useT();
  const [code, setCode] = useState('');
  const [busy, run] = useAction();

  const pickup = () =>
    run(async () => {
      await api.post(`/driver/orders/${order._id}/pickup`);
      haptic.success();
      toast.success(t('da.pickedUp'));
      onChanged();
    });

  const release = async () => {
    if (!(await confirmDialog(t('da.giveBackConfirm')))) return;
    run(async () => {
      await api.post(`/driver/orders/${order._id}/release`);
      onChanged();
    });
  };

  const deliver = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/driver/orders/${order._id}/deliver`, { code });
      haptic.success();
      toast.success(t('da.delivered', { amount: money(order.driverEarning) }));
      onChanged();
    });
  };

  const customer = order.customer;
  const phone = order.delivery?.phone || customer?.phone;
  const beforePickup = ['accepted', 'preparing', 'ready'].includes(order.status);

  return (
    <div className="card stack stack--sm">
      <div className="row row--between">
        <strong>#{order.orderNumber}</strong>
        <StatusBadge status={order.status} />
      </div>

      <Route order={order} />
      <OrderItems items={order.items} />

      <div className="banner banner--info small stack stack--sm">
        <span className={beforePickup ? '' : 'muted'}>{t('da.payCafe', { amount: money(order.cafePayout) })}</span>
        <strong>{t('da.collect', { amount: money(order.total), name: personName(customer) })}</strong>
        <span className="muted">
          {t('da.keep', { amount: money(order.driverEarning), fee: money(order.platformEarning) })}
        </span>
      </div>

      <div className="row row--wrap">
        {phone && (
          <button className="btn btn--secondary btn--sm" onClick={() => callPhone(phone, { username: customer?.username, name: personName(customer) })}>
            {t('da.student')}
          </button>
        )}
        {customer?.username && (
          <button className="btn btn--secondary btn--sm" onClick={() => openTelegramUser(customer.username)}>
            {t('common.chat')}
          </button>
        )}
        {order.cafe?.phone && (
          <button className="btn btn--secondary btn--sm" onClick={() => callPhone(order.cafe.phone, { name: order.cafe.name })}>
            {t('da.cafe')}
          </button>
        )}
      </div>

      {beforePickup && (
        <>
          {order.status !== 'ready' && <p className="muted small">{t('da.stillPreparing')}</p>}
          <button className="btn btn--block" disabled={busy} onClick={pickup}>
            {t('da.pickedUpBtn')}
          </button>
          <button className="btn btn--ghost btn--block btn--sm" disabled={busy} onClick={release}>
            {t('da.giveBack')}
          </button>
        </>
      )}

      {order.status === 'picked_up' && (
        <form className="stack stack--sm" onSubmit={deliver}>
          <label className="field__label">{t('da.askCode')}</label>
          <div className="row">
            <input
              className="input input--code"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <button className="btn btn--grow" disabled={busy || code.length !== 4}>
              {t('da.deliveredBtn')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ActiveList() {
  const t = useT();
  const { data, loading, error, reload } = useApi('/driver/active');
  useSocketEvent('order:updated', () => reload());

  return (
    <Async loading={loading} error={error} reload={reload}>
      {data?.orders?.length ? (
        <div className="stack">
          {data.orders.map((o) => (
            <DeliveryCard key={o._id} order={o} onChanged={reload} />
          ))}
        </div>
      ) : (
        <Empty icon="🛵" title={t('da.none')} text={t('da.noneText')} />
      )}
    </Async>
  );
}

/** One finished delivery – tap to see the items and money breakdown */
function HistoryRow({ order }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const delivered = order.status === 'delivered';
  const when = order.deliveredAt || order.cancelledAt || order.updatedAt;

  return (
    <div className="stack stack--sm">
      <button type="button" className="order-row history-row" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className="history-row__main">
          <strong>
            #{order.orderNumber} · {order.cafe?.name}
          </strong>
          <div className="muted small">
            → {placeName(order.delivery)} · {dateTime(when)}
          </div>
        </div>
        <div className="order-row__right">
          <StatusBadge status={order.status} />
          {delivered && <span className="small history-row__earned">+{money(order.driverEarning)}</span>}
        </div>
      </button>

      {open && (
        <div className="card stack stack--sm">
          <Route order={order} />
          <OrderItems items={order.items} />
          {delivered ? (
            <div className="banner banner--info small stack stack--sm">
              <span>{t('dh.collected', { amount: money(order.total), name: personName(order.customer) })}</span>
              <span>{t('dh.paidCafe', { amount: money(order.cafePayout) })}</span>
              <span>{t('dh.fee', { amount: money(order.platformEarning) })}</span>
              <strong>{t('dh.earned', { amount: money(order.driverEarning) })}</strong>
            </div>
          ) : (
            order.cancelReason && <p className="muted small">{t('dh.cancelReason', { reason: order.cancelReason })}</p>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryList() {
  const t = useT();
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (p = 1) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const { data } = await api.get('/driver/history', { params: { page: p } });
      setOrders((prev) => (p === 1 ? data.orders : [...prev, ...data.orders]));
      setHasMore(Boolean(data.hasMore));
      setPage(p);
    } catch (err) {
      if (p === 1) setError(errorMessage(err));
      else toast.error(errorMessage(err));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);
  // A delivery just finished (or was cancelled) – refresh the top of the list
  useSocketEvent('order:updated', () => load(1));

  return (
    <Async loading={loading} error={error} reload={() => load(1)}>
      {orders.length ? (
        <div className="stack">
          {orders.map((o) => (
            <HistoryRow key={o._id} order={o} />
          ))}
          {hasMore && (
            <button className="btn btn--secondary btn--block" disabled={loadingMore} onClick={() => load(page + 1)}>
              {loadingMore ? t('common.loading') : t('dh.loadMore')}
            </button>
          )}
        </div>
      ) : (
        <Empty icon="🧾" title={t('dh.none')} text={t('dh.noneText')} />
      )}
    </Async>
  );
}

export default function DriverActive() {
  const t = useT();
  const [tab, setTab] = useState('active');

  return (
    <div className="page stack">
      <h2>{t('da.title')}</h2>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'active', label: t('dh.active') },
          { value: 'history', label: t('dh.history') },
        ]}
      />
      {tab === 'active' ? <ActiveList /> : <HistoryList />}
    </div>
  );
}
