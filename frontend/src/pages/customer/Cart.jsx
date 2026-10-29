import { useState } from 'react';
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
import PlaceFields, { KindSwitch, dormLabel, emptyPlace, isPlaceReady } from '../../components/PlaceFields.jsx';

export default function Cart() {
  const t = useT();
  const { user, settings, refresh } = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  // Delivery fee = the price of the cafe's area (Campus & around, Gubre…)
  const { data: cafeData } = useApi(cart.cafe ? `/cafes/${cart.cafe._id}` : null);
  const cafeArea = cafeData?.cafe?.area || null;

  const isStudent = user.userType === 'student' || (!user.userType && user.savedPlace?.kind === 'dorm');
  const saved = user.savedPlace?.kind === 'dorm' ? user.savedPlace : null;

  // 'saved' = my dorm, 'other' = another dorm or another place (teachers/staff always type the place)
  const [mode, setMode] = useState(saved ? 'saved' : 'other');
  const [other, setOther] = useState(() => emptyPlace(isStudent ? 'dorm' : 'place', user.gender || ''));
  const [note, setNote] = useState('');
  const [saveDefault, setSaveDefault] = useState(isStudent && !saved);
  const [busy, run] = useAction();

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

  const ready = mode === 'saved' ? Boolean(saved) : isPlaceReady(other);
  const deliveryFee = Number(cafeArea?.deliveryFee) || 0;
  const total = cart.subtotal + deliveryFee;

  const placeOrder = () =>
    run(async () => {
      if (!ready) {
        toast.error(t('cart.chooseWhere'));
        return;
      }
      const where =
        mode === 'saved'
          ? { useSaved: true }
          : { place: other, saveAsDefault: isStudent && other.kind === 'dorm' && saveDefault };
      const { data } = await api.post('/orders', {
        cafeId: cart.cafe._id,
        items: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          options: l.options.map((o) => o.name),
          note: l.note,
        })),
        ...where,
        note,
      });
      haptic.success();
      if (where.saveAsDefault) refresh();
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
        {saved && (
          <div className="choice-list">
            <button
              type="button"
              className={`choice ${mode === 'saved' ? 'choice--active' : ''}`}
              onClick={() => setMode('saved')}
              aria-pressed={mode === 'saved'}
            >
              <span className="choice__icon">🏠</span>
              <span className="choice__body">
                <strong>{t('cart.myDorm')}</strong>
                <span className="muted small">{dormLabel(t, saved)}</span>
              </span>
              <span className="choice__check">{mode === 'saved' ? '✓' : ''}</span>
            </button>
            <button
              type="button"
              className={`choice ${mode === 'other' ? 'choice--active' : ''}`}
              onClick={() => setMode('other')}
              aria-pressed={mode === 'other'}
            >
              <span className="choice__icon">📍</span>
              <span className="choice__body">
                <strong>{t('cart.otherPlace')}</strong>
                <span className="muted small">{t('cart.otherPlaceSub')}</span>
              </span>
              <span className="choice__check">{mode === 'other' ? '✓' : ''}</span>
            </button>
          </div>
        )}

        {mode === 'other' && (
          <>
            <KindSwitch
              value={other.kind}
              onChange={(kind) => setOther((p) => ({ ...p, kind }))}
              dormLabel={t('cart.anotherDorm')}
              placeLabel={t('cart.anotherPlace')}
            />
            <PlaceFields value={other} onChange={setOther} />
            {isStudent && other.kind === 'dorm' && (
              <label className="check">
                <input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} />
                <span>{saved ? t('cart.saveUsual') : t('cart.saveFirst')}</span>
              </label>
            )}
          </>
        )}

        {ready && (mode === 'saved' ? saved.kind === 'dorm' : other.kind === 'dorm') && (
          <p className="small muted">{t('cart.dormDriverNote')}</p>
        )}
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
          <span>{cafeArea ? money(deliveryFee) : '—'}</span>
        </div>
        <div className="sum-row sum-row--total">
          <span>{t('cart.total')}</span>
          <span>{money(total)}</span>
        </div>
        <p className="muted small">{t('cart.payCash')}</p>
      </div>

      <button
        className="btn btn--block btn--lg"
        disabled={busy || !ready || (settings && !settings.isPlatformOpen)}
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
