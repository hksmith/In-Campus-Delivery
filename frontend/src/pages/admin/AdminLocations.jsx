import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { LOCATION_TYPES } from '../../lib/constants.js';
import { confirmDialog, useBackButton } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { Async, Empty, Field, Sheet, Toggle } from '../../components/ui.jsx';
import { useT } from '../../i18n/index.js';

const blank = { name: '', type: 'dorm', description: '', deliveryFee: '', sortOrder: 0, driverGender: 'any', isActive: true };

export default function AdminLocations() {
  const t = useT();
  const navigate = useNavigate();
  const back = useCallback(() => navigate('/admin/more'), [navigate]);
  useBackButton(back);

  const { data, loading, error, reload } = useApi('/admin/locations');
  const [editing, setEditing] = useState(null);
  const [busy, run] = useAction();

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const payload = { ...editing, deliveryFee: Number(editing.deliveryFee), sortOrder: Number(editing.sortOrder) || 0 };
      if (editing._id) await api.patch(`/admin/locations/${editing._id}`, payload);
      else await api.post('/admin/locations', payload);
      toast.success(t('common.saved'));
      setEditing(null);
      reload();
    });
  };

  const remove = async () => {
    if (!(await confirmDialog(t('al.deleteConfirm', { name: editing.name })))) return;
    run(async () => {
      const { data: res } = await api.delete(`/admin/locations/${editing._id}`);
      toast.success(res.deactivated ? t('al.deactivated') : t('al.deleted'));
      setEditing(null);
      reload();
    });
  };

  const set = (k) => (e) => setEditing((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="page stack">
      <div className="row row--between">
        <h2>{t('al.title')}</h2>
        <button className="btn btn--sm" onClick={() => setEditing(blank)}>
          {t('common.add')}
        </button>
      </div>
      <p className="muted small">{t('al.hint')}</p>
      <Async loading={loading} error={error} reload={reload}>
        {data?.locations?.length ? (
          data.locations.map((l) => (
            <button key={l._id} className={`list-link ${l.isActive ? '' : 'list-link--off'}`} onClick={() => setEditing(l)}>
              <span>
                {l.name}
                <span className="muted small block">
                  {t(`loc.${l.type}`)}
                  {l.driverGender === 'female' ? ` · ${t('common.femaleOnly')}` : l.driverGender === 'male' ? ` · ${t('common.maleOnly')}` : ''}
                  {l.description ? ` · ${l.description}` : ''}
                  {!l.isActive ? ` · ${t('al.hidden')}` : ''}
                </span>
              </span>
              <strong>{money(l.deliveryFee)}</strong>
            </button>
          ))
        ) : (
          <Empty icon="📍" text={t('al.empty')} />
        )}
      </Async>

      {editing && (
        <Sheet open title={editing._id ? t('al.edit') : t('al.new')} onClose={() => setEditing(null)}>
          <form className="stack" onSubmit={save}>
            <Field label={t('al.name')}>
              <input className="input" value={editing.name} onChange={set('name')} required placeholder={t('al.namePh')} />
            </Field>
            <Field label={t('al.type')}>
              <select className="input" value={editing.type} onChange={set('type')}>
                {LOCATION_TYPES.map((lt) => (
                  <option key={lt} value={lt}>
                    {t(`loc.${lt}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('al.fee')}>
              <input className="input" type="number" min="0" value={editing.deliveryFee} onChange={set('deliveryFee')} required />
            </Field>
            <Field label={t('al.note')} hint={t('al.noteHint')}>
              <input className="input" value={editing.description || ''} onChange={set('description')} />
            </Field>
            <Field label={t('al.order')}>
              <input className="input" type="number" value={editing.sortOrder} onChange={set('sortOrder')} />
            </Field>
            <Field label={t('al.whoDelivers')} hint={t('al.whoDeliversHint')}>
              <select className="input" value={editing.driverGender || 'any'} onChange={set('driverGender')}>
                <option value="any">{t('al.anyDriver')}</option>
                <option value="female">{t('common.femaleOnly')}</option>
                <option value="male">{t('common.maleOnly')}</option>
              </select>
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
