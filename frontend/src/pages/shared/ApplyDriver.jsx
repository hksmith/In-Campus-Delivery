import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAction } from '../../lib/hooks.js';
import { useBackButton } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/index.js';
import { Field, ImageUpload } from '../../components/ui.jsx';

export default function ApplyDriver() {
  const t = useT();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const back = useCallback(() => navigate('/profile'), [navigate]);
  useBackButton(back);

  const [idNumber, setIdNumber] = useState(user.studentId || '');
  const [gender, setGender] = useState(user.gender || '');
  const [idImage, setIdImage] = useState('');
  const [busy, run] = useAction();

  if (user.role !== 'customer') {
    return (
      <div className="page">
        <p className="muted">{t('apply.already', { role: t(`role.${user.role}`) })}</p>
      </div>
    );
  }

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const { data } = await api.post('/users/me/driver-application', { idNumber, idImage, gender });
      setUser(data.user);
      toast.success(t('apply.sent'));
      navigate('/profile');
    });
  };

  return (
    <div className="page stack">
      <h2>{t('apply.title')}</h2>
      <div className="card stack">
        <p className="muted">{t('apply.intro')}</p>
        <ul className="bullets">
          <li>{t('apply.b1')}</li>
          <li>{t('apply.b2')}</li>
          <li>{t('apply.b3')}</li>
        </ul>
      </div>
      <form className="card stack" onSubmit={submit}>
        <Field label={t('apply.idNumber')}>
          <input className="input" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} required />
        </Field>
        <Field label={t('common.gender')} hint={t('apply.genderHint')}>
          <div className="row">
            {['female', 'male'].map((g) => (
              <button
                type="button"
                key={g}
                className={`chip btn--grow ${gender === g ? 'chip--active' : ''}`}
                onClick={() => setGender(g)}
              >
                {t(`common.${g}`)}
              </button>
            ))}
          </div>
        </Field>
        <ImageUpload label={t('apply.idPhoto')} value={idImage} onChange={setIdImage} />
        <button className="btn btn--block" disabled={busy || !gender}>
          {busy ? t('common.sending') : t('apply.send')}
        </button>
      </form>
    </div>
  );
}
