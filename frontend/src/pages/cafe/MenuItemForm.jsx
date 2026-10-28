import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { confirmDialog, useBackButton } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { Field, ImageUpload, Loader } from '../../components/ui.jsx';
import { useT } from '../../i18n/index.js';

const blank = { name: '', description: '', price: '', category: '', image: '', options: [], isAvailable: true };

export default function MenuItemForm() {
  const t = useT();
  const { itemId } = useParams();
  const isNew = !itemId;
  const navigate = useNavigate();
  const back = useCallback(() => navigate('/cafe/menu'), [navigate]);
  useBackButton(back);

  const { data, loading } = useApi('/my-cafe/menu');
  const [form, setForm] = useState(blank);
  const [busy, run] = useAction();

  useEffect(() => {
    if (!isNew && data?.items) {
      const item = data.items.find((i) => i._id === itemId);
      if (item) setForm({ ...blank, ...item, price: String(item.price) });
    }
  }, [data, itemId, isNew]);

  const categories = [...new Set((data?.items || []).map((i) => i.category).filter(Boolean))];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const setOption = (idx, key, value) =>
    setForm((f) => ({ ...f, options: f.options.map((o, i) => (i === idx ? { ...o, [key]: value } : o)) }));

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const payload = {
        name: form.name,
        description: form.description,
        price: Number(form.price),
        category: form.category || 'Other',
        image: form.image,
        isAvailable: form.isAvailable,
        options: form.options
          .filter((o) => String(o.name || '').trim())
          .map((o) => ({ name: o.name.trim(), price: Number(o.price) || 0 })),
      };
      if (isNew) await api.post('/my-cafe/menu', payload);
      else await api.patch(`/my-cafe/menu/${itemId}`, payload);
      toast.success(t('common.saved'));
      navigate('/cafe/menu');
    });
  };

  const remove = async () => {
    if (!(await confirmDialog(t('mf.deleteConfirm', { name: form.name })))) return;
    run(async () => {
      await api.delete(`/my-cafe/menu/${itemId}`);
      toast.success(t('mf.deleted'));
      navigate('/cafe/menu');
    });
  };

  if (!isNew && loading) return <Loader />;

  return (
    <div className="page">
      <h2>{isNew ? t('mf.newTitle') : t('mf.editTitle')}</h2>
      <form className="card stack" onSubmit={save}>
        <Field label={t('mf.name')}>
          <input className="input" value={form.name} onChange={set('name')} required />
        </Field>
        <Field label={t('mf.price')}>
          <input className="input" type="number" min="0" step="0.5" value={form.price} onChange={set('price')} required />
        </Field>
        <Field label={t('mf.category')} hint={t('mf.categoryHint')}>
          <input className="input" list="categories" value={form.category} onChange={set('category')} />
          <datalist id="categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={t('mf.description')}>
          <textarea className="input" rows={2} value={form.description} onChange={set('description')} />
        </Field>
        <ImageUpload value={form.image} onChange={(image) => setForm((f) => ({ ...f, image }))} />

        <div className="stack stack--sm">
          <div className="row row--between">
            <strong>{t('mf.extras')}</strong>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setForm((f) => ({ ...f, options: [...f.options, { name: '', price: 0 }] }))}
            >
              {t('common.add')}
            </button>
          </div>
          {form.options.length === 0 && <p className="muted small">{t('mf.extrasHint')}</p>}
          {form.options.map((o, idx) => (
            <div key={idx} className="row">
              <input className="input" placeholder={t('mf.optName')} value={o.name} onChange={(e) => setOption(idx, 'name', e.target.value)} />
              <input
                className="input input--narrow"
                type="number"
                min="0"
                placeholder={t('mf.optPrice')}
                value={o.price}
                onChange={(e) => setOption(idx, 'price', e.target.value)}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) }))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <label className="check">
          <input type="checkbox" checked={form.isAvailable} onChange={(e) => setForm((f) => ({ ...f, isAvailable: e.target.checked }))} />
          <span>{t('mf.available')}</span>
        </label>

        <button className="btn btn--block" disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </button>
        {!isNew && (
          <button type="button" className="btn btn--danger btn--block" disabled={busy} onClick={remove}>
            {t('mf.delete')}
          </button>
        )}
      </form>
    </div>
  );
}
