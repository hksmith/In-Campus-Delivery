import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { useBackButton } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/index.js';
import { Field, ImageUpload } from '../../components/ui.jsx';
import { ruleText } from '../../components/FeeRule.jsx';

export default function RegisterCafe() {
  const t = useT();
  const { user, settings } = useAuth();
  const navigate = useNavigate();
  const back = useCallback(() => navigate('/profile'), [navigate]);
  useBackButton(back);

  const [form, setForm] = useState({
    name: '',
    description: '',
    phone: user.phone || '',
    campusSpot: '',
    areaId: '',
    openingTime: '07:00',
    closingTime: '21:00',
    prepTimeMinutes: 15,
    logo: '',
  });
  const [busy, run] = useAction();
  const { data: areaData } = useApi('/areas');
  const areas = areaData?.areas || [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/cafes/apply', { ...form, prepTimeMinutes: Number(form.prepTimeMinutes) });
      toast.success(t('reg.sent'));
      navigate('/profile');
    });
  };

  return (
    <div className="page stack">
      <h2>{t('reg.title')}</h2>
      {settings?.commission?.value > 0 && (
        <div className="banner banner--info small">{t('reg.commissionNote', { pct: ruleText(settings.commission) })}</div>
      )}
      <form className="card stack" onSubmit={submit}>
        <Field label={t('reg.name')}>
          <input className="input" value={form.name} onChange={set('name')} required />
        </Field>
        <Field label={t('reg.desc')}>
          <textarea className="input" rows={2} value={form.description} onChange={set('description')} />
        </Field>
        <Field label={t('reg.area')} hint={t('reg.areaHint')}>
          <div className="choice-list">
            {areas.map((a) => (
              <button
                type="button"
                key={a._id}
                className={`choice ${form.areaId === a._id ? 'choice--active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, areaId: a._id }))}
                aria-pressed={form.areaId === a._id}
              >
                <span className="choice__icon">📍</span>
                <span className="choice__body">
                  <strong>{a.name}</strong>
                  <span className="muted small">
                    {t('reg.areaFee', { fee: money(a.deliveryFee) })}
                    {a.description ? ` · ${a.description}` : ''}
                  </span>
                </span>
                <span className="choice__check">{form.areaId === a._id ? '✓' : ''}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('reg.where')} hint={t('reg.whereHint')}>
          <input className="input" value={form.campusSpot} onChange={set('campusSpot')} placeholder={t('reg.wherePh')} />
        </Field>
        <Field label={t('reg.phone')}>
          <input className="input" type="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <div className="row">
          <Field label={t('reg.opens')}>
            <input className="input" type="time" value={form.openingTime} onChange={set('openingTime')} />
          </Field>
          <Field label={t('reg.closes')}>
            <input className="input" type="time" value={form.closingTime} onChange={set('closingTime')} />
          </Field>
        </div>
        <Field label={t('reg.prep')}>
          <input className="input" type="number" min={1} max={180} value={form.prepTimeMinutes} onChange={set('prepTimeMinutes')} />
        </Field>
        <ImageUpload label={t('reg.logo')} value={form.logo} onChange={(logo) => setForm((f) => ({ ...f, logo }))} />
        <button className="btn btn--block" disabled={busy || !form.areaId}>
          {busy ? t('common.sending') : t('reg.submit')}
        </button>
      </form>
    </div>
  );
}
