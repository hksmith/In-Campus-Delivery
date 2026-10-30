import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction, useTicker } from '../../lib/hooks.js';
import { STATUS, TRACK_STEPS } from '../../lib/constants.js';
import { dateTime, minutesUntil, money, personName, time, placeName } from '../../lib/format.js';
import { useSocketEvent } from '../../lib/socket.js';
import { callPhone, confirmDialog, openTelegramUser, useBackButton } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useCart } from '../../context/CartContext.jsx';
import { useT } from '../../i18n/index.js';
import { Async, OrderItems, Stars, StatusBadge } from '../../components/ui.jsx';

function Timeline({ order }) {
  const t = useT();
  const failed = ['cancelled', 'rejected'].includes(order.status);
  const current = TRACK_STEPS.indexOf(order.status);
  return (
    <ol className="timeline">
      {TRACK_STEPS.map((step, idx) => {
        const done = !failed && idx <= current;
        const entry = order.statusHistory?.find((h) => h.status === step);
        return (
          <li
            key={step}
            className={`timeline__step ${done ? 'timeline__step--done' : ''} ${idx === current ? 'timeline__step--current' : ''}`}
          >
            <span className="timeline__dot">{done ? STATUS[step].icon : ''}</span>
            <span className="timeline__label">{t(`status.${step}`)}</span>
            {entry && <span className="muted small">{time(entry.at)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function ReviewForm({ order, onDone }) {
  const t = useT();
  const [cafeRating, setCafeRating] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, run] = useAction();

  const submit = () =>
    run(async () => {
      if (!cafeRating) return toast.error(t('od.tapStars'));
      await api.post(`/orders/${order._id}/review`, {
        cafeRating,
        driverRating: driverRating || undefined,
        comment,
      });
      toast.success(t('od.thanks'));
      onDone();
    });

  return (
    <div className="card stack">
      <h3>{t('od.howWasIt')}</h3>
      <div className="row row--between">
        <span>{order.cafe?.name}</span>
        <Stars value={cafeRating} onChange={setCafeRating} />
      </div>
      {order.driver && (
        <div className="row row--between">
          <span>{t('od.driver', { name: personName(order.driver) })}</span>
          <Stars value={driverRating} onChange={setDriverRating} />
        </div>
      )}
      <textarea
        className="input"
        rows={2}
        placeholder={t('od.commentPh')}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button className="btn" disabled={busy} onClick={submit}>
        {t('od.sendRating')}
      </button>
    </div>
  );
}

export default function OrderDetail() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const back = useCallback(() => navigate('/orders'), [navigate]);
  useBackButton(back);
  useTicker(30000);

  const cart = useCart();
  const { data, loading, error, reload } = useApi(`/orders/${id}`);
  const [busy, run] = useAction();
  useSocketEvent('order:updated', (p) => p.orderId === id && reload());

  const order = data?.order;

  const cancel = async () => {
    if (!(await confirmDialog(t('od.cancelConfirm')))) return;
    run(async () => {
      await api.post(`/orders/${id}/cancel`);
      toast.info(t('od.cancelled'));
      reload();
    });
  };

  /** Put the same items back in the cart (server re-checks prices and availability) */
  const reorder = async () => {
    if (!order) return;
    if (cart.count && cart.cafe?._id !== order.cafe._id) {
      if (!(await confirmDialog(t('od.replaceCart', { cafe: cart.cafe.name })))) return;
      cart.clear();
    }
    order.items.forEach((i) => {
      if (!i.menuItem) return;
      cart.add(order.cafe, { _id: i.menuItem, name: i.name, price: i.basePrice }, i.options || [], i.quantity, i.note || '');
    });
    navigate('/cart');
  };

  return (
    <Async loading={loading} error={error} reload={reload}>
      {order && (
        <div className="page stack">
          <div className="row row--between">
            <div>
              <h2>{t('od.title', { n: order.orderNumber })}</h2>
              <div className="muted small">{dateTime(order.createdAt)}</div>
            </div>
            <StatusBadge status={order.status} />
          </div>

          {order.status === 'pending' && <div className="banner banner--warn">{t('od.waiting', { cafe: order.cafe?.name })}</div>}
          {['accepted', 'preparing'].includes(order.status) && order.estimatedReadyAt && (
            <div className="banner banner--info">{t('od.readyIn', { n: Math.max(1, minutesUntil(order.estimatedReadyAt)) })}</div>
          )}
          {['cancelled', 'rejected'].includes(order.status) && (
            <div className="banner banner--bad">
              {t(`status.${order.status}`)}
              {order.cancelReason ? `: ${order.cancelReason}` : ''}
            </div>
          )}

          {['picked_up', 'ready', 'preparing', 'accepted'].includes(order.status) && order.deliveryCode && (
            <div className="code-card">
              <div className="muted small">{t('od.codeTitle')}</div>
              <div className="code-card__code">{order.deliveryCode}</div>
              <div className="small">{t('od.payCash', { amount: money(order.total) })}</div>
            </div>
          )}

          {!['cancelled', 'rejected'].includes(order.status) && <Timeline order={order} />}

          {order.driver && order.status !== 'delivered' && (
            <div className="card row row--between">
              <div>
                <div className="muted small">{t('od.yourDriver')}</div>
                <strong>{personName(order.driver)}</strong>
              </div>
              <div className="row">
                {order.driver.phone && (
                  <button className="btn btn--secondary btn--sm" onClick={() => callPhone(order.driver.phone, { username: order.driver.username, name: personName(order.driver) })}>
                    {t('common.call')}
                  </button>
                )}
                {order.driver.username && (
                  <button className="btn btn--secondary btn--sm" onClick={() => openTelegramUser(order.driver.username)}>
                    {t('common.chat')}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="row row--between">
              <strong>{order.cafe?.name}</strong>
              {order.cafe?.phone && (
                <button className="link small" onClick={() => callPhone(order.cafe.phone, { name: order.cafe.name })}>
                  {t('od.callCafe')}
                </button>
              )}
            </div>
            <OrderItems items={order.items} />
            <div className="sum-row">
              <span>{t('cart.food')}</span>
              <span>{money(order.subtotal)}</span>
            </div>
            <div className="sum-row">
              <span>{t('cart.delivery')}</span>
              <span>{money(order.deliveryFee)}</span>
            </div>
            <div className="sum-row sum-row--total">
              <span>{t('od.totalCash')}</span>
              <span>{money(order.total)}</span>
            </div>
          </div>

          <div className="card small">
            📍 {placeName(order.delivery)}
            {order.delivery?.details ? ` – ${order.delivery.details}` : ''}
            {order.note && <div className="muted">📝 {order.note}</div>}
          </div>

          {order.status === 'delivered' && !order.isReviewed && <ReviewForm order={order} onDone={reload} />}
          {data.review && (
            <div className="card">
              <div className="row row--between">
                <span>{t('od.yourRating')}</span>
                <Stars value={data.review.cafeRating} size="sm" />
              </div>
              {data.review.comment && <p className="muted small">“{data.review.comment}”</p>}
              {data.review.reply && <p className="small">🏪 {data.review.reply}</p>}
            </div>
          )}

          {order.status === 'pending' && (
            <button className="btn btn--danger btn--block" disabled={busy} onClick={cancel}>
              {t('od.cancel')}
            </button>
          )}
          {['delivered', 'cancelled', 'rejected'].includes(order.status) && (
            <button className="btn btn--secondary btn--block" onClick={reorder}>
              {t('od.orderAgain', { cafe: order.cafe?.name })}
            </button>
          )}
        </div>
      )}
    </Async>
  );
}
