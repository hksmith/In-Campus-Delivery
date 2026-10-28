import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { requestWriteAccess } from '../../lib/telegram.js';
import { useT } from '../../i18n/index.js';
import LanguageSwitch from '../../components/LanguageSwitch.jsx';
import ProfileForm from './ProfileForm.jsx';

/**
 * Step 1 for everyone: enter name + phone.
 * - Admin / cafe / driver accounts then go straight to their dashboard.
 * - Everyone else continues to step 2 ("What do you want to do?" – ChooseStart.jsx).
 */
const ROLE_ONB = {
  admin: { emoji: '⚙️', intro: 'onb.introAdmin', start: 'onb.startDashboard' },
  cafe_owner: { emoji: '🍽', intro: 'onb.introCafe', start: 'onb.startDashboard' },
  cafe_staff: { emoji: '🍽', intro: 'onb.introCafe', start: 'onb.startDashboard' },
  driver: { emoji: '🛵', intro: 'onb.introDriver', start: 'onb.startDashboard' },
  customer: { emoji: '👋', intro: 'onb.introNew', start: 'onb.next' },
};

export function StepDots({ step, total = 2 }) {
  return (
    <div className="step-dots" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i + 1 === step ? 'on' : ''} />
      ))}
    </div>
  );
}

export default function Onboarding() {
  const t = useT();
  const { config, user } = useAuth();
  const role = ROLE_ONB[user.role] || ROLE_ONB.customer;
  const isNew = user.role === 'customer';

  // Allow the bot to send order updates even if the user never pressed /start
  useEffect(() => {
    requestWriteAccess();
  }, []);

  return (
    <div className="onboarding">
      <LanguageSwitch />
      {isNew && <StepDots step={1} />}
      <div className="onboarding__hero">
        <div className="onboarding__emoji">{role.emoji}</div>
        <h1>{user.firstName ? t('onb.welcomeName', { name: user.firstName }) : t('onb.welcome')}</h1>
        <p className="muted">{t(role.intro, { uni: config?.universityName || t('onb.campus') })}</p>
      </div>
      <div className="card">
        <h3>{t('onb.enterInfo')}</h3>
        <ProfileForm minimal submitLabel={t(role.start)} />
      </div>
    </div>
  );
}
