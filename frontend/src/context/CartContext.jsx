import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

/**
 * Cart holds items from ONE cafe at a time.
 * line = { key, menuItemId, name, basePrice, unitPrice, options: [{name, price}], quantity, note }
 */
const CartContext = createContext(null);
const STORAGE_KEY = 'cart:v1';

const empty = { cafe: null, lines: [] };

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || empty;
  } catch {
    return empty;
  }
}

const lineKey = (menuItemId, options, note) =>
  `${menuItemId}|${options.map((o) => o.name).sort().join(',')}|${note || ''}`;

function reducer(state, action) {
  switch (action.type) {
    case 'add': {
      const { cafe, item, options = [], quantity = 1, note = '' } = action;
      const base = state.cafe && state.cafe._id === cafe._id ? state : { cafe: { _id: cafe._id, name: cafe.name }, lines: [] };
      const key = lineKey(item._id, options, note);
      const unitPrice = item.price + options.reduce((s, o) => s + o.price, 0);
      const existing = base.lines.find((l) => l.key === key);
      const lines = existing
        ? base.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, l.quantity + quantity) } : l))
        : [
            ...base.lines,
            { key, menuItemId: item._id, name: item.name, basePrice: item.price, unitPrice, options, quantity, note },
          ];
      return { ...base, lines };
    }
    case 'setQty': {
      const lines = state.lines
        .map((l) => (l.key === action.key ? { ...l, quantity: Math.min(20, action.quantity) } : l))
        .filter((l) => l.quantity > 0);
      return lines.length ? { ...state, lines } : empty;
    }
    case 'clear':
      return empty;
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state]);

  const value = useMemo(() => {
    const count = state.lines.reduce((s, l) => s + l.quantity, 0);
    const subtotal = state.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    return {
      ...state,
      count,
      subtotal,
      add: (cafe, item, options, quantity, note) => dispatch({ type: 'add', cafe, item, options, quantity, note }),
      setQty: (key, quantity) => dispatch({ type: 'setQty', key, quantity }),
      clear: () => dispatch({ type: 'clear' }),
      qtyOf: (menuItemId) =>
        state.lines.filter((l) => l.menuItemId === menuItemId).reduce((s, l) => s + l.quantity, 0),
    };
  }, [state]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
