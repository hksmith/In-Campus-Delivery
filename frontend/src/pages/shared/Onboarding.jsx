import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { requestWriteAccess } from '../../lib/telegram.js';
import { useT } from '../../i18n/index.js';
import LanguageSwitch from '../../components/LanguageSwitch.jsx';
import ProfileForm from './ProfileForm.jsx';

export default function Onboarding() {
  const t = useT();
  const { config, user } = useAuth();

  // Allow the bot to send order updates even if the user never pressed /start
  useEffect(() => {
    requestWriteAccess();
  }, []);

  return (
    <div className="onboarding">
      <LanguageSwitch />
      <div className="onboarding__hero">
        <div className="onboarding__emoji">🍔🛵</div>
        <h1>{user.firstName ? t('onb.welcomeName', { name: user.firstName }) : t('onb.welcome')}</h1>
        <p className="muted">{t('onb.intro', { uni: config?.universityName || t('onb.campus') })}</p>
      </div>
      <div className="card">
        <h3>{t('onb.setup')}</h3>
        <ProfileForm submitLabel={t('onb.start')} />
      </div>
    </div>
  );
}
