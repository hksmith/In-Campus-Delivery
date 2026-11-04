import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { confirmDialog, haptic, useBackButton } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useCart } from '../../context/CartContext.jsx';
import { useT } from '../../i18n/index.js';
import { Async, Empty, FloatingCart, Sheet } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import LanguageSwitch from '../../components/LanguageSwitch.jsx';
import { sized } from '../../lib/image.js';

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
      {item.image && <img src={sized(item.image, 640)} alt="" className="sheet__image" decoding="async" />}
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
          <div className="cafe-cover">
            {cafe.logo ? (
              <img src={sized(cafe.logo, 640)} alt="" className="cafe-cover__img" decoding="async" />
            ) : (
              <div className="cafe-cover__pattern">🥘🍔🥤☕🫓🍟🥘🍔🥤☕🫓🍟🥘🍔🥤☕🫓🍟🥘🍔🥤☕🫓🍟</div>
            )}
            <div className="cafe-cover__bar">
              <button className="round-btn" onClick={back} aria-label="Back">
                <Icon name="back" size={18} />
              </button>
              <LanguageSwitch compact />
            </div>
          </div>
          <div className="cafe-info">
            <div className="cafe-hero">
              {cafe.logo ? <img src={sized(cafe.logo, 72, 72)} alt="" className="cafe-hero__logo" decoding="async" /> : <div className="cafe-hero__logo">🍽</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row row--between" style={{ alignItems: 'flex-start' }}>
                  <h2>{cafe.name}</h2>
                  <span className={`dot ${cafe.isOpen ? 'dot--ok' : 'dot--bad'}`}>{cafe.isOpen ? t('home.open') : t('home.closed')}</span>
                </div>
                {cafe.description && <p className="muted small clamp">{cafe.description}</p>}
              </div>
            </div>
            <div className="facts">
              <div>
                <strong>
                  {cafe.ratingCount ? (
                    <>
                      <Icon name="star" size={13} fill /> {Number(cafe.rating).toFixed(1)}
                    </>
                  ) : (
                    '—'
                  )}
                </strong>
                <span>{cafe.ratingCount ? `(${cafe.ratingCount})` : t('ui.ratingNew')}</span>
              </div>
              <div>
                <strong>{t('home.min', { n: cafe.prepTimeMinutes })}</strong>
                <span>
                  {cafe.openingTime}–{cafe.closingTime}
                </span>
              </div>
              <div>
                <strong>{cafe.area ? money(cafe.area.deliveryFee) : '—'}</strong>
                <span>{t('cart.delivery')}</span>
              </div>
            </div>
            {(cafe.area || cafe.campusSpot) && (
              <div className="meta">
                <span>
                  <Icon name="pin" size={13} />
                  {[cafe.area?.name, cafe.campusSpot].filter(Boolean).join(' · ')}
                </span>
              </div>
            )}
          </div>
          {!cafe.isOpen && <div className="banner banner--bad">{t('menu.closedBanner')}</div>}
          {cafe.minOrderAmount > 0 && <div className="muted small">{t('menu.minOrder', { amount: money(cafe.minOrderAmount) })}</div>}

          {categories.length > 2 && (
            <div className="chips-scroll chips-sticky">
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
                      {item.image ? (
                        <span className="menu-item__media">
                          <img src={sized(item.image, 88, 88)} alt="" className="menu-item__img" loading="lazy" decoding="async" />
                          {inCart > 0 ? <span className="menu-item__count">{inCart}</span> : <span className="menu-item__add">+</span>}
                        </span>
                      ) : inCart > 0 ? (
                        <span className="menu-item__count menu-item__count--solo">{inCart}</span>
                      ) : (
                        <span className="menu-item__add menu-item__add--solo">+</span>
                      )}
                    </button>
                  );
                })}
              </section>
            ))}

          {selected && <ItemSheet item={selected} cafe={cafe} onClose={() => setSelected(null)} />}

          {cart.count > 0 && cart.cafe?._id === cafe._id && (
            <FloatingCart
              count={cart.count}
              title={t('menu.viewCart', { n: cart.count })}
              subtitle={cafe.name}
              total={money(cart.subtotal)}
            />
          )}
        </div>
      )}
    </Async>
  );
}
