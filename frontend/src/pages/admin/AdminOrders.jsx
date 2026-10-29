import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { dateTime, money, personName, timeAgo, placeName } from '../../lib/format.js';
import { useSocketEvent } from '../../lib/socket.js';
import { callPhone, confirmDialog, promptDialog } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useT } from '../../i18n/index.js';
import { Async, Empty, GenderTag, OrderItems, Sheet, StatusBadge, Tabs } from '../../components/ui.jsx';

function AssignSheet({ order, onClose, onDone }) {
  const t = useT();
  const { data } = useApi('/admin/drivers', { params: { status: 'approved' } });
  const [busy, run] = useAction();
  const assign = (driver) =>
    run(async () => {
      await api.post(`/admin/orders/${order._id}/assign`, { driverId: driver._id });
      toast.success(t('ao.assigned', { name: personName(driver) }));
      onDone();
      onClose();
    });
  const drivers = (data?.drivers || [])
    .filter((d) => !['female', 'male'].includes(order.delivery?.driverGender) || d.gender === order.delivery.driverGender)
    .sort((a, b) => Number(b.driverProfile.isOnline) - Number(a.driverProfile.isOnline));
  return (
    <Sheet open title={t('ao.assignTitle', { n: order.orderNumber })} onClose={onClose}>
      <GenderTag only={order.delivery?.driverGender} className="small block" />
      {drivers.map((d) => (
        <button key={d._id} className="list-link" disabled={busy} onClick={() => assign(d)}>
          <span>
            {d.driverProfile.isOnline ? '🟢' : '⚪'} {personName(d)}
            <span className="muted small block">
              {d.phone} · {t('ap.wallet', { amount: money(d.driverProfile.walletBalance) })}
            </span>
          </span>
          <span className="small">{t('ao.assign')}</span>
        </button>
      ))}
      {!drivers.length && <p className="muted">{t('ao.noDrivers')}</p>}
    </Sheet>
  );
}

function AdminOrderCard({ order, onChanged, startOpen }) {
  const t = useT();
  const [open, setOpen] = useState(startOpen);
  const [assigning, setAssigning] = useState(false);
  const [busy, run] = useAction();
  const finished = ['delivered', 'cancelled', 'rejected'].includes(order.status);
  const issueOpen = order.pickupIssue?.reported && !order.pickupIssue?.resolved;

  const post = (path, body, msg) =>
    run(async () => {
      await api.post(`/admin/orders/${order._id}/${path}`, body);
      toast.success(msg);
      onChanged();
    });

  const cancel = async () => {
    const reason = await promptDialog(t('ao.cancelPrompt'));
    if (reason === null) return;
    post('cancel', { reason: reason || 'Cancelled by admin' }, t('ao.cancelled'));
  };
  const release = async () => {
    if (!(await confirmDialog(t('ao.removeConfirm')))) return;
    post('release-driver', {}, t('ao.removed'));
  };
  const forceDeliver = async () => {
    if (!(await confirmDialog(t('ao.deliverConfirm')))) return;
    post('force-deliver', {}, t('ao.delivered'));
  };
  const resolve = async () => {
    const note = await promptDialog(t('ao.resolvePrompt'));
    if (note === null) return;
    post('resolve-issue', { note }, t('ao.resolved'));
  };

  return (
    <div className={`card stack stack--sm ${issueOpen ? 'card--warn' : ''}`}>
      <button className="row row--between plain" onClick={() => setOpen((o) => !o)}>
        <div style={{ textAlign: 'left' }}>
          <strong>#{order.orderNumber}</strong> · {order.cafe?.name}
          <div className="muted small">
            {personName(order.customer)} → {placeName(order.delivery)} · {timeAgo(order.createdAt)}
          </div>
        </div>
        <div className="order-row__right">
          <StatusBadge status={order.status} />
          <span className="small">{money(order.total)}</span>
        </div>
      </button>
      {issueOpen && (
        <div className="banner banner--bad small">
          {t('ao.issue')}
          {order.pickupIssue.note ? `: “${order.pickupIssue.note}”` : ''}
        </div>
      )}
      {open && (
        <>
          <OrderItems items={order.items} />
          <div className="small muted stack stack--sm">
            <span>{t('ao.created', { date: dateTime(order.createdAt) })}</span>
            <span>
              👤 {personName(order.customer)} {order.delivery?.phone}{' '}
              {order.delivery?.phone && (
                <button className="link" onClick={() => callPhone(order.delivery.phone)}>
                  {t('common.call')}
                </button>
              )}
            </span>
            <span>
              🛵 {order.driver ? `${personName(order.driver)} ${order.driver.phone || ''}` : t('ao.noDriver')}{' '}
              {order.driver?.phone && (
                <button className="link" onClick={() => callPhone(order.driver.phone)}>
                  {t('common.call')}
                </button>
              )}
            </span>
            <GenderTag only={order.delivery?.driverGender} className="" />
            <span>
              {t('ao.money', {
                cp: money(order.cafePayout),
                c: money(order.commission),
                d: money(order.driverEarning),
                p: money(order.platformEarning),
              })}
            </span>
            {order.cancelReason && <span>{t('common.reason', { reason: order.cancelReason })}</span>}
          </div>
          <div className="row row--wrap">
            {issueOpen && (
              <button className="btn btn--sm" disabled={busy} onClick={resolve}>
                {t('ao.resolve')}
              </button>
            )}
            {!finished && order.status !== 'pending' && (
              <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => setAssigning(true)}>
                {order.driver ? t('ao.reassign') : t('ao.assignDriver')}
              </button>
            )}
            {!finished && order.driver && (
              <button className="btn btn--secondary btn--sm" disabled={busy} onClick={release}>
                {t('ao.removeDriver')}
              </button>
            )}
            {order.status === 'picked_up' && (
              <button className="btn btn--secondary btn--sm" disabled={busy} onClick={forceDeliver}>
                {t('ao.markDelivered')}
              </button>
            )}
            {!finished && (
              <button className="btn btn--danger btn--sm" disabled={busy} onClick={cancel}>
                {t('ao.cancel')}
              </button>
            )}
          </div>
        </>
      )}
      {assigning && <AssignSheet order={order} onClose={() => setAssigning(false)} onDone={onChanged} />}
    </div>
  );
}

export default function AdminOrders() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const scope = params.get('issues') === '1' ? 'issues' : params.get('scope') || 'active';
  const setScope = (s) => setParams(s === 'issues' ? { issues: '1' } : { scope: s }, { replace: true });
  const [search, setSearch] = useState('');
  const query = scope === 'issues' ? { issues: '1', scope: 'all' } : { scope, ...(search ? { search } : {}) };
  const { data, loading, error, reload } = useApi('/admin/orders', { params: query });
  useSocketEvent('order:updated', () => reload());

  return (
    <div className="page stack">
      <h2>{t('ao.title')}</h2>
      <Tabs
        value={scope}
        onChange={setScope}
        tabs={[
          { value: 'active', label: t('ao.active') },
          { value: 'all', label: t('ao.all') },
          { value: 'issues', label: t('ao.issues') },
        ]}
      />
      {scope !== 'issues' && (
        <input
          className="input"
          inputMode="numeric"
          placeholder={t('ao.find')}
          value={search}
          onChange={(e) => setSearch(e.target.value.replace(/\D/g, ''))}
        />
      )}
      <Async loading={loading} error={error} reload={reload}>
        {data?.orders?.length ? (
          <div className="stack">
            {data.orders.map((o) => (
              <AdminOrderCard key={o._id} order={o} onChanged={reload} startOpen={scope === 'issues'} />
            ))}
          </div>
        ) : (
          <Empty icon="🧾" text={t('ao.none')} />
        )}
      </Async>
    </div>
  );
}
