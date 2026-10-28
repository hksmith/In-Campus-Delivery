import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi, useAction, useTicker } from '../../lib/hooks.js';
import { money, personName, timeAgo, minutesUntil } from '../../lib/format.js';
import { useSocketEvent } from '../../lib/socket.js';
import { callPhone, confirmDialog, haptic, promptDialog } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/index.js';
import { Async, Empty, OrderItems, StatusBadge, Tabs, Toggle } from '../../components/ui.jsx';

/** Short "ding" so the counter notices new orders */
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.start();
    o.stop(ctx.currentTime + 0.6);
  } catch {
    /* audio not allowed */
  }
}

function AcceptingSwitch() {
  const t = useT();
  const { cafe, refresh } = useAuth();
  const [busy, run] = useAction();
  if (!cafe) return null;
  const toggle = (value) =>
    run(async () => {
      await api.patch('/my-cafe/accepting', { isAcceptingOrders: value });
      await refresh();
      toast.success(value ? t('co.takingToast') : t('co.pausedToast'));
    });
  return (
    <div className={`card row row--between ${cafe.isAcceptingOrders ? '' : 'card--warn'}`}>
      <div>
        <strong>{cafe.name}</strong>
        <div className="muted small">{cafe.isAcceptingOrders ? t('co.taking') : t('co.paused')}</div>
      </div>
      <Toggle checked={cafe.isAcceptingOrders} disabled={busy} onChange={toggle} />
    </div>
  );
}

function CafeOrderCard({ order, onChanged }) {
  const t = useT();
  const { config } = useAuth();
  const [busy, run] = useAction();
  const act = (path, body, msg) =>
    run(async () => {
      await api.post(`/my-cafe/orders/${order._id}/${path}`, body);
      haptic.success();
      if (msg) toast.success(msg);
      onChanged();
    });

  const reject = async () => {
    const reason = await promptDialog(t('co.declinePrompt'), t('co.declineDefault'));
    if (reason === null) return;
    act('reject', { reason }, t('co.declined'));
  };
  const cancel = async () => {
    const reason = await promptDialog(t('co.cancelPrompt'));
    if (!reason) return;
    if (!(await confirmDialog(t('co.cancelConfirm')))) return;
    act('cancel', { reason }, t('co.cancelled'));
  };
  const reportUnpaid = async () => {
    const note = await promptDialog(t('co.reportPrompt'));
    if (note === null) return;
    act('report-unpaid', { note }, t('co.reported'));
  };

  const waitingMins = Math.floor((Date.now() - new Date(order.createdAt)) / 60000);
  const leftToAccept = (config?.acceptTimeoutMinutes || 5) - waitingMins;
  const readyIn = minutesUntil(order.estimatedReadyAt);
  const pickedUp = ['picked_up', 'delivered'].includes(order.status);

  return (
    <div className={`card order-card ${order.status === 'pending' ? 'order-card--new' : ''}`}>
      <div className="row row--between">
        <div>
          <strong>#{order.orderNumber}</strong> <span className="muted small">· {timeAgo(order.createdAt)}</span>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <OrderItems items={order.items} />
      {order.note && <div className="banner banner--info small">📝 {order.note}</div>}

      <div className="sum-row">
        <span>{t('co.foodTotal')}</span>
        <span>{money(order.subtotal)}</span>
      </div>
      {order.commission > 0 && (
        <div className="sum-row muted small">
          <span>{t('co.commission')}</span>
          <span>−{money(order.commission)}</span>
        </div>
      )}
      <div className="sum-row sum-row--total">
        <span>💵 {t('co.driverPays')}</span>
        <span>{money(order.cafePayout)}</span>
      </div>

      <div className="muted small">
        👤 {personName(order.customer)} · 📍 {order.delivery?.locationName}
        {order.driver ? ` · 🛵 ${personName(order.driver)}` : ''}
      </div>

      {order.status === 'pending' && (
        <>
          <div className="small warn-text">{t('co.acceptWithin', { n: Math.max(0, leftToAccept) })}</div>
          <div className="row">
            <button className="btn btn--danger btn--sm" disabled={busy} onClick={reject}>
              {t('co.decline')}
            </button>
            <button className="btn btn--grow" disabled={busy} onClick={() => act('accept', {}, t('co.accepted'))}>
              {t('co.accept')}
            </button>
          </div>
        </>
      )}
      {['accepted', 'preparing'].includes(order.status) && (
        <>
          {readyIn !== null && (
            <div className="small muted">
              {readyIn >= 0 ? t('co.promised', { n: readyIn }) : t('co.promisedLate', { n: -readyIn })}
            </div>
          )}
          <div className="row">
            {order.status === 'accepted' && (
              <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => act('preparing')}>
                {t('co.preparing')}
              </button>
            )}
            <button className="btn btn--grow" disabled={busy} onClick={() => act('ready', {}, t('co.markedReady'))}>
              {t('co.ready')}
            </button>
          </div>
        </>
      )}
      {order.status === 'ready' && (
        <div className="small muted">
          {order.driver ? t('co.waitingFor', { name: personName(order.driver) }) : t('co.waitingAny')}
        </div>
      )}
      {['accepted', 'preparing', 'ready'].includes(order.status) && (
        <div className="row">
          {order.driver?.phone && (
            <button className="btn btn--ghost btn--sm" onClick={() => callPhone(order.driver.phone)}>
              {t('co.driver')}
            </button>
          )}
          <button className="btn btn--ghost btn--sm" disabled={busy} onClick={cancel}>
            {t('co.cancelBtn')}
          </button>
        </div>
      )}

      {pickedUp && order.driver && (
        <div className="stack stack--sm">
          <div className="small">{t('co.paidAtPickup', { name: personName(order.driver), amount: money(order.cafePayout) })}</div>
          {order.pickupIssue?.reported ? (
            <div className={`banner small ${order.pickupIssue.resolved ? 'banner--info' : 'banner--bad'}`}>
              {order.pickupIssue.resolved ? t('co.issueResolved') : t('co.issueOpen')}
            </div>
          ) : (
            <div className="row">
              {order.driver.phone && (
                <button className="btn btn--ghost btn--sm" onClick={() => callPhone(order.driver.phone)}>
                  {t('co.driver')}
                </button>
              )}
              <button className="btn btn--danger btn--sm" disabled={busy} onClick={reportUnpaid}>
                {t('co.reportUnpaid')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CafeOrders() {
  const t = useT();
  const [tab, setTab] = useState('new');
  useTicker(30000);
  const active = useApi('/my-cafe/orders', { params: { scope: 'active' } });
  const history = useApi(tab === 'history' ? '/my-cafe/orders' : null, { params: { scope: 'history' } });

  useSocketEvent('order:new', () => {
    beep();
    haptic.warning();
    toast.info(t('co.newToast'));
  });
  useSocketEvent('order:updated', () => {
    active.reload();
    if (tab === 'history') history.reload();
  });
  useSocketEvent('socket:connected', () => active.reload());

  const orders = active.data?.orders || [];
  const groups = {
    new: orders.filter((o) => o.status === 'pending'),
    kitchen: orders.filter((o) => ['accepted', 'preparing', 'ready'].includes(o.status)),
    out: orders.filter((o) => o.status === 'picked_up'),
  };
  const list = tab === 'history' ? history.data?.orders || [] : groups[tab];
  const state = tab === 'history' ? history : active;

  return (
    <div className="page stack">
      <AcceptingSwitch />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'new', label: t('co.tabNew'), count: groups.new.length },
          { value: 'kitchen', label: t('co.tabKitchen'), count: groups.kitchen.length },
          { value: 'out', label: t('co.tabOut'), count: groups.out.length },
          { value: 'history', label: t('co.tabHistory') },
        ]}
      />
      <Async loading={state.loading} error={state.error} reload={state.reload}>
        {list.length ? (
          <div className="stack">
            {list.map((o) => (
              <CafeOrderCard
                key={o._id}
                order={o}
                onChanged={() => {
                  active.reload();
                  if (tab === 'history') history.reload();
                }}
              />
            ))}
          </div>
        ) : (
          <Empty icon={tab === 'new' ? '🔔' : '🧾'} text={tab === 'new' ? t('co.emptyNew') : t('common.nothingHere')} />
        )}
      </Async>
    </div>
  );
}
