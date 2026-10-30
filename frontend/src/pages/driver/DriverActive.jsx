import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { money, personName } from '../../lib/format.js';
import { useSocketEvent } from '../../lib/socket.js';
import { callPhone, confirmDialog, haptic, openTelegramUser } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useT } from '../../i18n/index.js';
import { Async, Empty, OrderItems, StatusBadge } from '../../components/ui.jsx';
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

export default function DriverActive() {
  const t = useT();
  const { data, loading, error, reload } = useApi('/driver/active');
  useSocketEvent('order:updated', () => reload());

  return (
    <div className="page stack">
      <h2>{t('da.title')}</h2>
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
    </div>
  );
}
