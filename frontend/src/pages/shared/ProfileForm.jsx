import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAction } from '../../lib/hooks.js';
import { requestPhone } from '../../lib/telegram.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/index.js';
import { Field } from '../../components/ui.jsx';
import PlaceFields, { emptyPlace, fromSaved, isPlaceReady } from '../../components/PlaceFields.jsx';

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
  const [place, setPlace] = useState(() => fromSaved(user.savedPlace, user.gender) || emptyPlace('dorm', user.gender || ''));
  const [form, setForm] = useState({
    fullName: user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '),
    phone: user.phone || '',
    userType: user.userType || '',
    studentId: user.studentId || '',
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
      // Students: save their dorm only when it is filled in completely
      if (orders && body.userType === 'student' && isPlaceReady(place)) body.savedPlace = place;
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
          {form.userType === 'student' && (
            <>
              <h4>{t('choose.dormTitle')}</h4>
              <PlaceFields value={place} onChange={setPlace} />
            </>
          )}
        </>
      )}
      <button className="btn btn--block" disabled={busy}>
        {busy ? t('common.saving') : submitLabel || t('common.save')}
      </button>
    </form>
  );
}
