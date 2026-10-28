import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { personName } from '../../lib/format.js';
import { confirmDialog } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { Async, Field, ImageUpload } from '../../components/ui.jsx';
import { useT } from '../../i18n/index.js';
import { ruleText } from '../../components/FeeRule.jsx';

function CafeProfileForm() {
  const t = useT();
  const { refresh } = useAuth();
  const { data, loading, error, reload } = useApi('/my-cafe');
  const [form, setForm] = useState(null);
  const [busy, run] = useAction();

  useEffect(() => {
    if (data?.cafe) setForm(data.cafe);
  }, [data]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = (e) => {
    e.preventDefault();
    run(async () => {
      await api.patch('/my-cafe', {
        name: form.name,
        description: form.description,
        logo: form.logo,
        phone: form.phone,
        campusSpot: form.campusSpot,
        openingTime: form.openingTime,
        closingTime: form.closingTime,
        prepTimeMinutes: Number(form.prepTimeMinutes),
        minOrderAmount: Number(form.minOrderAmount) || 0,
      });
      await refresh();
      toast.success(t('set.updated'));
    });
  };

  return (
    <Async loading={loading} error={error} reload={reload}>
      {form && (
        <form className="card stack" onSubmit={save}>
          <h3>{t('set.details')}</h3>
          {data?.commission && (
            <div className="banner banner--info small">{t('set.yourCommission', { rule: ruleText(data.commission) })}</div>
          )}
          <Field label={t('reg.name')}>
            <input className="input" value={form.name || ''} onChange={set('name')} required />
          </Field>
          <Field label={t('reg.desc')}>
            <textarea className="input" rows={2} value={form.description || ''} onChange={set('description')} />
          </Field>
          <Field label={t('set.location')}>
            <input className="input" value={form.campusSpot || ''} onChange={set('campusSpot')} />
          </Field>
          <Field label={t('set.phone')}>
            <input className="input" type="tel" value={form.phone || ''} onChange={set('phone')} />
          </Field>
          <div className="row">
            <Field label={t('reg.opens')}>
              <input className="input" type="time" value={form.openingTime} onChange={set('openingTime')} />
            </Field>
            <Field label={t('reg.closes')}>
              <input className="input" type="time" value={form.closingTime} onChange={set('closingTime')} />
            </Field>
          </div>
          <div className="row">
            <Field label={t('set.prep')}>
              <input className="input" type="number" min={1} max={180} value={form.prepTimeMinutes} onChange={set('prepTimeMinutes')} />
            </Field>
            <Field label={t('set.minOrder')}>
              <input className="input" type="number" min={0} value={form.minOrderAmount} onChange={set('minOrderAmount')} />
            </Field>
          </div>
          <ImageUpload label={t('reg.logo')} value={form.logo} onChange={(logo) => setForm((f) => ({ ...f, logo }))} />
          <button className="btn btn--block" disabled={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </form>
      )}
    </Async>
  );
}

function StaffManager() {
  const t = useT();
  const { data, loading, error, reload } = useApi('/my-cafe/staff');
  const [username, setUsername] = useState('');
  const [busy, run] = useAction();

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post('/my-cafe/staff', { username });
      setUsername('');
      toast.success(t('set.staffAdded'));
      reload();
    });
  };
  const remove = async (s) => {
    if (!(await confirmDialog(t('set.removeStaff', { name: personName(s) })))) return;
    run(async () => {
      await api.delete(`/my-cafe/staff/${s._id}`);
      reload();
    });
  };

  return (
    <div className="card stack">
      <h3>{t('set.staff')}</h3>
      <p className="muted small">{t('set.staffHint')}</p>
      <Async loading={loading} error={error} reload={reload}>
        {data?.staff?.map((s) => (
          <div key={s._id} className="row row--between">
            <span>
              {personName(s)} {s.username && <span className="muted small">@{s.username}</span>}
            </span>
            <button className="link small" onClick={() => remove(s)}>
              {t('common.remove')}
            </button>
          </div>
        ))}
      </Async>
      <form className="row" onSubmit={add}>
        <input className="input" placeholder="@username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <button className="btn btn--sm" disabled={busy || !username.trim()}>
          {t('common.add')}
        </button>
      </form>
    </div>
  );
}

export default function CafeSettings() {
  const t = useT();
  return (
    <div className="page stack">
      <h2>{t('set.title')}</h2>
      <CafeProfileForm />
      <StaffManager />
      <Link to="/profile" className="list-link">
        {t('set.myProfile')}
      </Link>
    </div>
  );
}
