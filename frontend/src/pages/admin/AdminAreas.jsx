import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { confirmDialog, useBackButton } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { Async, Empty, Field, Sheet, Toggle } from '../../components/ui.jsx';
import { useT } from '../../i18n/index.js';

const blank = { name: '', description: '', deliveryFee: '', sortOrder: 0, isActive: true };

/**
 * Delivery areas (Campus & around, Gubre, …) – each has ONE delivery fee.
 * Cafes pick their area when registering; an order's delivery fee is the price of the cafe's area.
 */
export default function AdminAreas() {
  const t = useT();
  const navigate = useNavigate();
  const back = useCallback(() => navigate('/admin/more'), [navigate]);
  useBackButton(back);

  const { data, loading, error, reload } = useApi('/admin/areas');
  const [editing, setEditing] = useState(null);
  const [busy, run] = useAction();
  const set = (k) => (e) => setEditing((f) => ({ ...f, [k]: e.target.value }));

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const payload = {
        name: editing.name,
        description: editing.description,
        deliveryFee: Number(editing.deliveryFee),
        sortOrder: Number(editing.sortOrder) || 0,
        isActive: editing.isActive,
      };
      if (editing._id) await api.patch(`/admin/areas/${editing._id}`, payload);
      else await api.post('/admin/areas', payload);
      toast.success(t('common.saved'));
      setEditing(null);
      reload();
    });
  };

  const remove = async () => {
    if (!(await confirmDialog(t('aa.deleteConfirm', { name: editing.name })))) return;
    run(async () => {
      const { data: res } = await api.delete(`/admin/areas/${editing._id}`);
      toast.success(res.deactivated ? t('aa.deactivated') : t('aa.deleted'));
      setEditing(null);
      reload();
    });
  };

  return (
    <div className="page stack">
      <div className="row row--between">
        <h2>{t('aa.title')}</h2>
        <button className="btn btn--sm" onClick={() => setEditing(blank)}>
          {t('common.add')}
        </button>
      </div>
      <p className="muted small">{t('aa.hint')}</p>
      <Async loading={loading} error={error} reload={reload}>
        {data?.areas?.length ? (
          data.areas.map((a) => (
            <button key={a._id} className={`list-link ${a.isActive ? '' : 'list-link--off'}`} onClick={() => setEditing(a)}>
              <span>
                {a.name}
                <span className="muted small block">
                  {t('aa.counts', { cafes: a.cafeCount || 0 })}
                  {a.description ? ` · ${a.description}` : ''}
                  {!a.isActive ? ` · ${t('al.hidden')}` : ''}
                </span>
              </span>
              <strong>{money(a.deliveryFee)}</strong>
            </button>
          ))
        ) : (
          <Empty icon="🗺️" text={t('aa.empty')} />
        )}
      </Async>
      <div className="banner banner--info small">{t('aa.rule')}</div>

      {editing && (
        <Sheet open title={editing._id ? t('aa.edit') : t('aa.new')} onClose={() => setEditing(null)}>
          <form className="stack" onSubmit={save}>
            <Field label={t('aa.name')}>
              <input className="input" value={editing.name} onChange={set('name')} required placeholder={t('aa.namePh')} />
            </Field>
            <Field label={t('aa.fee')} hint={t('aa.feeHint')}>
              <input className="input" type="number" min="0" value={editing.deliveryFee} onChange={set('deliveryFee')} required />
            </Field>
            <Field label={t('al.note')}>
              <input className="input" value={editing.description || ''} onChange={set('description')} placeholder={t('aa.notePh')} />
            </Field>
            <Field label={t('al.order')}>
              <input className="input" type="number" value={editing.sortOrder} onChange={set('sortOrder')} />
            </Field>
            <Toggle label={t('al.visible')} checked={editing.isActive} onChange={(v) => setEditing((f) => ({ ...f, isActive: v }))} />
            <button className="btn btn--block" disabled={busy}>
              {t('common.save')}
            </button>
            {editing._id && (
              <button type="button" className="btn btn--danger btn--block" disabled={busy} onClick={remove}>
                {t('common.delete')}
              </button>
            )}
          </form>
        </Sheet>
      )}
    </div>
  );
}
