import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { confirmDialog, haptic, useBackButton } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useCart } from '../../context/CartContext.jsx';
import { useT } from '../../i18n/index.js';
import { Async, Empty, Rating, Sheet } from '../../components/ui.jsx';

function ItemSheet({ item, cafe, onClose }) {
  const t = useT();
  const cart = useCart();
  const [qty, setQty] = useState(1);
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState('');

  const options = item.options.filter((o) => picked.includes(o.name));
  const unit = item.price + options.reduce((s, o) => s + o.price, 0);

  const add = async () => {
    if (cart.cafe && cart.cafe._id !== cafe._id && cart.lines.length) {
      const ok = await confirmDialog(t('menu.replaceCart', { a: cart.cafe.name, b: cafe.name }));
      if (!ok) return;
    }
    cart.add(cafe, item, options, qty, note.trim());
    haptic.success();
    toast.success(t('menu.added', { name: item.name }));
    onClose();
  };

  return (
    <Sheet open title={item.name} onClose={onClose}>
      {item.image && <img src={item.image} alt="" className="sheet__image" />}
      {item.description && <p className="muted">{item.description}</p>}
      {item.options.length > 0 && (
        <div className="stack stack--sm">
          <strong>{t('menu.extras')}</strong>
          {item.options.map((o) => (
            <label key={o.name} className="check">
              <input
                type="checkbox"
                checked={picked.includes(o.name)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, o.name] : p.filter((n) => n !== o.name)))}
              />
              <span>{o.name}</span>
              <span className="muted">{o.price ? `+${money(o.price)}` : t('menu.free')}</span>
            </label>
          ))}
        </div>
      )}
      <input className="input" placeholder={t('menu.notePh')} value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} />
      <div className="row row--between">
        <div className="qty">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
          <span>{qty}</span>
          <button onClick={() => setQty((q) => Math.min(20, q + 1))}>+</button>
        </div>
        <button className="btn" onClick={add}>
          {t('menu.add', { amount: money(unit * qty) })}
        </button>
      </div>
    </Sheet>
  );
}

export default function CafeMenu() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const back = useCallback(() => navigate('/'), [navigate]);
  useBackButton(back);

  const cart = useCart();
  const { data, loading, error, reload } = useApi(`/cafes/${id}`);
  const [selected, setSelected] = useState(null);
  const [category, setCategory] = useState('__all');

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of data?.menu || []) {
      const c = item.category || 'Other';
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(item);
    }
    return map;
  }, [data]);

  const cafe = data?.cafe;
  const categories = ['__all', ...groups.keys()];

  return (
    <Async loading={loading} error={error} reload={reload}>
      {cafe && (
        <div className="page stack">
          <div className="cafe-hero">
            {cafe.logo ? <img src={cafe.logo} alt="" className="cafe-hero__logo" /> : <div className="cafe-hero__logo">🍽</div>}
            <div>
              <h2>{cafe.name}</h2>
              <div className="muted small">
                <Rating value={cafe.rating} count={cafe.ratingCount} /> · {t('home.min', { n: cafe.prepTimeMinutes })} ·{' '}
                {cafe.openingTime}–{cafe.closingTime}
              </div>
              {cafe.campusSpot && <div className="muted small">📍 {cafe.campusSpot}</div>}
            </div>
          </div>
          {cafe.description && <p className="muted">{cafe.description}</p>}
          {!cafe.isOpen && <div className="banner banner--bad">{t('menu.closedBanner')}</div>}
          {cafe.minOrderAmount > 0 && <div className="muted small">{t('menu.minOrder', { amount: money(cafe.minOrderAmount) })}</div>}

          {categories.length > 2 && (
            <div className="chips-scroll">
              {categories.map((c) => (
                <button key={c} className={`chip ${category === c ? 'chip--active' : ''}`} onClick={() => setCategory(c)}>
                  {c === '__all' ? t('common.all') : c}
                </button>
              ))}
            </div>
          )}

          {groups.size === 0 && <Empty icon="📋" text={t('menu.empty')} />}

          {[...groups.entries()]
            .filter(([c]) => category === '__all' || c === category)
            .map(([c, items]) => (
              <section key={c} className="stack stack--sm">
                <h3 className="section-title">{c}</h3>
                {items.map((item) => {
                  const inCart = cart.cafe?._id === cafe._id ? cart.qtyOf(item._id) : 0;
                  const disabled = !item.isAvailable || !cafe.isOpen;
                  return (
                    <button
                      key={item._id}
                      className={`menu-item ${disabled ? 'menu-item--disabled' : ''}`}
                      onClick={() => !disabled && setSelected(item)}
                    >
                      <div className="menu-item__body">
                        <strong>{item.name}</strong>
                        {item.description && <span className="muted small clamp">{item.description}</span>}
                        <span className="menu-item__price">
                          {money(item.price)} {!item.isAvailable && <span className="badge badge--bad">{t('ui.soldOut')}</span>}
                        </span>
                      </div>
                      {item.image ? <img src={item.image} alt="" className="menu-item__img" /> : null}
                      {inCart > 0 && <span className="menu-item__count">{inCart}</span>}
                    </button>
                  );
                })}
              </section>
            ))}

          {selected && <ItemSheet item={selected} cafe={cafe} onClose={() => setSelected(null)} />}

          {cart.count > 0 && cart.cafe?._id === cafe._id && (
            <Link to="/cart" className="floating-cart">
              <span>{t('menu.viewCart', { n: cart.count })}</span>
              <strong>{money(cart.subtotal)}</strong>
            </Link>
          )}
        </div>
      )}
    </Async>
  );
}
