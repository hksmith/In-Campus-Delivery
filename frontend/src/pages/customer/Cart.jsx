import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { haptic } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { useT } from '../../i18n/index.js';
import { Empty, Field } from '../../components/ui.jsx';

export default function Cart() {
  const t = useT();
  const { user, settings } = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const { data: locData } = useApi('/locations');
  const locations = locData?.locations || [];

  const [locationId, setLocationId] = useState(user.defaultLocation?._id || user.defaultLocation || '');
  const [details, setDetails] = useState(user.defaultLocationDetails || '');
  const [note, setNote] = useState('');
  const [saveDefault, setSaveDefault] = useState(!user.defaultLocation);
  const [busy, run] = useAction();

  // If the saved default location was removed, clear it
  useEffect(() => {
    if (locations.length && locationId && !locations.some((l) => l._id === locationId)) setLocationId('');
  }, [locations, locationId]);

  if (!cart.count) {
    return (
      <div className="page">
        <Empty
          icon="🛒"
          title={t('cart.emptyTitle')}
          text={t('cart.emptyText')}
          action={
            <Link to="/" className="btn">
              {t('cart.browse')}
            </Link>
          }
        />
      </div>
    );
  }

  const location = locations.find((l) => l._id === locationId);
  const deliveryFee = location?.deliveryFee || 0;
  const total = cart.subtotal + deliveryFee;

  const placeOrder = () =>
    run(async () => {
      if (!locationId) {
        toast.error(t('cart.chooseWhere'));
        return;
      }
      const { data } = await api.post('/orders', {
        cafeId: cart.cafe._id,
        items: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          options: l.options.map((o) => o.name),
          note: l.note,
        })),
        locationId,
        locationDetails: details,
        note,
        saveAsDefault: saveDefault,
      });
      haptic.success();
      cart.clear();
      navigate(`/orders/${data.order._id}`, { replace: true });
    });

  return (
    <div className="page stack">
      <h2>{t('cart.title')}</h2>
      <div className="card">
        <div className="row row--between">
          <strong>{cart.cafe.name}</strong>
          <Link to={`/cafes/${cart.cafe._id}`} className="link small">
            {t('cart.addMore')}
          </Link>
        </div>
        <ul className="cart-lines">
          {cart.lines.map((l) => (
            <li key={l.key}>
              <div className="cart-lines__info">
                <span>{l.name}</span>
                {l.options.length > 0 && <span className="muted small">{l.options.map((o) => o.name).join(', ')}</span>}
                {l.note && <span className="muted small">“{l.note}”</span>}
                <span className="small">{money(l.unitPrice * l.quantity)}</span>
              </div>
              <div className="qty qty--sm">
                <button onClick={() => cart.setQty(l.key, l.quantity - 1)}>−</button>
                <span>{l.quantity}</span>
                <button onClick={() => cart.setQty(l.key, l.quantity + 1)}>+</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card stack">
        <h3>{t('cart.deliverTo')}</h3>
        <Field label={t('cart.place')}>
          <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">{t('cart.placePh')}</option>
            {locations.map((l) => (
              <option key={l._id} value={l._id}>
                {l.name} · {money(l.deliveryFee)}
              </option>
            ))}
          </select>
        </Field>
        {['female', 'male'].includes(location?.driverGender) && (
          <p className="small">{t(location.driverGender === 'female' ? 'cart.femaleOnlyNote' : 'cart.maleOnlyNote')}</p>
        )}
        {location?.description && <p className="muted small">ℹ️ {location.description}</p>}
        <Field label={t('pf.room')}>
          <input className="input" value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('pf.roomHint')} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} />
          <span>{t('cart.saveUsual')}</span>
        </label>
        <Field label={t('cart.noteCafe')}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
        <p className="muted small">{t('cart.driverWillCall', { phone: user.phone })}</p>
      </div>

      <div className="card">
        <div className="sum-row">
          <span>{t('cart.food')}</span>
          <span>{money(cart.subtotal)}</span>
        </div>
        <div className="sum-row">
          <span>{t('cart.delivery')}</span>
          <span>{location ? money(deliveryFee) : '—'}</span>
        </div>
        <div className="sum-row sum-row--total">
          <span>{t('cart.total')}</span>
          <span>{money(total)}</span>
        </div>
        <p className="muted small">{t('cart.payCash')}</p>
      </div>

      <button
        className="btn btn--block btn--lg"
        disabled={busy || !locationId || (settings && !settings.isPlatformOpen)}
        onClick={placeOrder}
      >
        {busy ? t('cart.placing') : t('cart.place_order', { amount: money(total) })}
      </button>
      <button className="btn btn--ghost btn--block" onClick={cart.clear}>
        {t('cart.clear')}
      </button>
    </div>
  );
}
