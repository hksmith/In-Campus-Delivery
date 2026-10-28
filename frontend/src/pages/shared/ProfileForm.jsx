import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { requestPhone } from '../../lib/telegram.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/index.js';
import { Field } from '../../components/ui.jsx';

/** Name / phone / student ID / default delivery spot – used by onboarding and profile */
export default function ProfileForm({ submitLabel, onSaved }) {
  const t = useT();
  const { user, setUser } = useAuth();
  const { data } = useApi('/locations');
  const [form, setForm] = useState({
    fullName: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '),
    phone: user.phone || '',
    studentId: user.studentId || '',
    defaultLocation: user.defaultLocation?._id || user.defaultLocation || '',
    defaultLocationDetails: user.defaultLocationDetails || '',
  });
  const [busy, run] = useAction();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const sharePhone = async () => {
    const phone = await requestPhone();
    if (phone) setForm((f) => ({ ...f, phone }));
  };

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const { data: res } = await api.patch('/users/me', form);
      setUser(res.user);
      onSaved?.(res.user);
    });
  };

  return (
    <form onSubmit={submit} className="stack">
      <Field label={t('pf.fullName')}>
        <input className="input" value={form.fullName} onChange={set('fullName')} placeholder={t('pf.fullNamePh')} required />
      </Field>
      <Field label={t('pf.phone')} hint={t('pf.phoneHint')}>
        <div className="row">
          <input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="09xxxxxxxx" required />
          <button type="button" className="btn btn--secondary btn--sm" onClick={sharePhone}>
            {t('pf.useTelegram')}
          </button>
        </div>
      </Field>
      <Field label={t('pf.studentId')}>
        <input className="input" value={form.studentId} onChange={set('studentId')} placeholder="UGR/1234/15" />
      </Field>
      <Field label={t('pf.usualPlace')}>
        <select className="input" value={form.defaultLocation} onChange={set('defaultLocation')}>
          <option value="">{t('pf.choose')}</option>
          {data?.locations?.map((l) => (
            <option key={l._id} value={l._id}>
              {l.name} · {money(l.deliveryFee)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('pf.room')} hint={t('pf.roomHint')}>
        <input className="input" value={form.defaultLocationDetails} onChange={set('defaultLocationDetails')} />
      </Field>
      <button className="btn btn--block" disabled={busy}>
        {busy ? t('common.saving') : submitLabel || t('common.save')}
      </button>
    </form>
  );
}
