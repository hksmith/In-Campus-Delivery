import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { requestPhone } from '../../lib/telegram.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/index.js';
import { Field } from '../../components/ui.jsx';

const USER_TYPES = ['student', 'teacher', 'staff', 'other'];

/**
 * Profile form.
 * - minimal: only name + phone (first screen when someone opens the app)
 * - full (Profile page): also "I am a", student ID and usual delivery place
 */
export default function ProfileForm({ submitLabel, onSaved, minimal = false }) {
  const t = useT();
  const { user, setUser } = useAuth();
  // Admins and cafe staff don't order to a dorm, so they only need name + phone
  const orders = !minimal && ['customer', 'driver'].includes(user.role);
  const { data } = useApi(orders ? '/locations' : null);
  const [form, setForm] = useState({
    fullName: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '),
    phone: user.phone || '',
    userType: user.userType || '',
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
      const body = minimal
        ? { fullName: form.fullName, phone: form.phone }
        : orders
          ? { ...form }
          : { fullName: form.fullName, phone: form.phone };
      if (!body.userType) delete body.userType;
      const { data: res } = await api.patch('/users/me', body);
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
      {orders && (
        <>
          <Field label={t('pf.userType')}>
            <select className="input" value={form.userType} onChange={set('userType')}>
              <option value="">{t('pf.choose')}</option>
              {USER_TYPES.map((u) => (
                <option key={u} value={u}>
                  {t(`ut.${u}`)}
                </option>
              ))}
            </select>
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
        </>
      )}
      <button className="btn btn--block" disabled={busy}>
        {busy ? t('common.saving') : submitLabel || t('common.save')}
      </button>
    </form>
  );
}
