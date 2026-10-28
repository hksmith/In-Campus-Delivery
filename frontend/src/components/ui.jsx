import { useEffect, useState } from 'react';
import { STATUS } from '../lib/constants.js';
import { subscribeToasts } from '../lib/toast.js';
import { subscribePrompt } from '../lib/dialog.js';
import { uploadImage, errorMessage } from '../lib/api.js';
import { money } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/index.js';

export function Loader({ label, full = false }) {
  const t = useT();
  return (
    <div className={`loader ${full ? 'loader--full' : ''}`}>
      <div className="spinner" />
      <span>{label || t('common.loading')}</span>
    </div>
  );
}

export function Empty({ icon = '🍽', title, text, action }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      {title && <h3>{title}</h3>}
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  const t = useT();
  return (
    <div className="empty">
      <div className="empty__icon">⚠️</div>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn--secondary" onClick={() => onRetry(false)}>
          {t('common.tryAgain')}
        </button>
      )}
    </div>
  );
}

/** Renders loading / error states, then children */
export function Async({ loading, error, reload, children }) {
  if (loading) return <Loader />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return children;
}

export function StatusBadge({ status }) {
  const t = useT();
  const s = STATUS[status] || { tone: 'info' };
  return <span className={`badge badge--${s.tone}`}>{t(`statusShort.${status}`)}</span>;
}

export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <label className={`toggle ${disabled ? 'toggle--disabled' : ''}`}>
      {label && <span>{label}</span>}
      <input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
    </label>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.value}
          className={`tabs__tab ${value === t.value ? 'tabs__tab--active' : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count ? <span className="tabs__count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Stars({ value = 0, onChange, size = 'md' }) {
  return (
    <div className={`stars stars--${size}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          className={`stars__star ${n <= value ? 'stars__star--on' : ''}`}
          onClick={onChange ? () => onChange(n) : undefined}
          disabled={!onChange}
          aria-label={`${n} star`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function Rating({ value, count }) {
  const t = useT();
  if (!count) return <span className="muted small">{t('ui.ratingNew')}</span>;
  return (
    <span className="small">
      ⭐ {Number(value).toFixed(1)} <span className="muted">({count})</span>
    </span>
  );
}

/** Bottom sheet modal */
export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}

/** Hosts prompts opened with promptDialog() */
export function PromptHost() {
  const t = useT();
  const [req, setReq] = useState(null);
  const [value, setValue] = useState('');
  useEffect(
    () =>
      subscribePrompt((r) => {
        setValue(r.defaultValue || '');
        setReq(r);
      }),
    []
  );
  if (!req) return null;
  const close = (result) => {
    req.resolve(result);
    setReq(null);
  };
  return (
    <Sheet open title={req.message} onClose={() => close(null)}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          close(value);
        }}
      >
        <textarea className="input" rows={3} autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="row">
          <button type="button" className="btn btn--secondary btn--grow" onClick={() => close(null)}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--grow">{t('common.ok')}</button>
        </div>
      </form>
    </Sheet>
  );
}

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(
    () =>
      subscribeToasts((t) => {
        setItems((list) => [...list, t]);
        setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), 3500);
      }),
    []
  );
  return (
    <div className="toaster">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function ImageUpload({ value, onChange, label }) {
  const t = useT();
  const { config } = useAuth();
  label = label || t('ui.photo');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!config?.uploadsEnabled) {
    return (
      <div className="field">
        <span className="field__label">{label}</span>
        <p className="muted small">{t('ui.uploadDisabled')}</p>
      </div>
    );
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="upload">
        {value ? <img src={value} alt="" className="upload__preview" /> : <div className="upload__placeholder">📷</div>}
        <div className="upload__actions">
          <label className="btn btn--secondary btn--sm">
            {busy ? t('common.uploading') : value ? t('common.change') : t('common.upload')}
            <input type="file" accept="image/*" hidden onChange={onFile} disabled={busy} />
          </label>
          {value && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange('')}>
              {t('common.remove')}
            </button>
          )}
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

/** List of order lines with options and notes */
export function OrderItems({ items }) {
  return (
    <ul className="order-items">
      {items.map((i, idx) => (
        <li key={idx}>
          <span className="order-items__qty">{i.quantity}×</span>
          <span className="order-items__name">
            {i.name}
            {i.options?.length > 0 && <span className="muted small"> · {i.options.map((o) => o.name).join(', ')}</span>}
            {i.note && <span className="muted small block">“{i.note}”</span>}
          </span>
          <span className="order-items__price">{money(i.unitPrice * i.quantity)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      {label && <span className="field__label">{label}</span>}
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function StatGrid({ items }) {
  return (
    <div className="stat-grid">
      {items.map((s) => (
        <div className="stat" key={s.label}>
          <div className="stat__value">{s.value}</div>
          <div className="stat__label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
