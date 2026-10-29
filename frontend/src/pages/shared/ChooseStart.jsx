import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAction } from '../../lib/hooks.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/index.js';
import LanguageSwitch from '../../components/LanguageSwitch.jsx';
import { StepDots } from './Onboarding.jsx';
import PlaceFields, { emptyPlace, fromSaved, isPlaceReady } from '../../components/PlaceFields.jsx';

const USER_TYPES = [
  { id: 'student', icon: '🎓' },
  { id: 'teacher', icon: '👩‍🏫' },
  { id: 'staff', icon: '🧑‍💼' },
  { id: 'other', icon: '🙂' },
];

const CHOICES = [
  { id: 'order', icon: '🍔', path: '/' },
  { id: 'deliver', icon: '🛵', path: '/apply/driver' },
  { id: 'cafe', icon: '🏪', path: '/apply/cafe' },
];

/**
 * Step 2 for regular users (after name + phone):
 * "I am a student / teacher / staff / other" + "I want to order / deliver / register my cafe".
 * Deliver and cafe open their application form; the admin approves them later.
 */
export default function ChooseStart() {
  const t = useT();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [userType, setUserType] = useState(user.userType || '');
  const [choice, setChoice] = useState('');
  // Students save their dorm (block + room); teachers/staff type the place on each order
  const [place, setPlace] = useState(() => fromSaved(user.savedPlace, user.gender) || emptyPlace('dorm', user.gender || ''));
  const [busy, run] = useAction();
  const needsPlace = choice === 'order' && userType === 'student';

  const go = () =>
    run(async () => {
      const { data } = await api.post('/users/me/start', {
        userType,
        choice,
        savedPlace: needsPlace ? place : undefined,
      });
      const target = CHOICES.find((c) => c.id === choice)?.path || '/';
      navigate(target, { replace: true });
      setUser(data.user);
    });

  return (
    <div className="onboarding">
      <LanguageSwitch />
      <StepDots step={2} />
      <div className="onboarding__hero">
        <h1>{t('choose.title')}</h1>
        <p className="muted">{t('choose.intro')}</p>
      </div>

      <div className="card stack">
        <h3>{t('choose.who')}</h3>
        <div className="who-grid">
          {USER_TYPES.map((u) => (
            <button
              type="button"
              key={u.id}
              className={`chip ${userType === u.id ? 'chip--active' : ''}`}
              onClick={() => setUserType(u.id)}
            >
              {u.icon} {t(`ut.${u.id}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h3>{t('choose.want')}</h3>
        <div className="choice-list">
          {CHOICES.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`choice ${choice === c.id ? 'choice--active' : ''}`}
              onClick={() => setChoice(c.id)}
              aria-pressed={choice === c.id}
            >
              <span className="choice__icon">{c.icon}</span>
              <span className="choice__body">
                <strong>{t(`choose.${c.id}`)}</strong>
                <span className="muted small">{t(`choose.${c.id}Sub`)}</span>
              </span>
              <span className="choice__check">{choice === c.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
        {choice && choice !== 'order' && <p className="muted small">{t('choose.approvalNote')}</p>}
      </div>

      {needsPlace && (
        <div className="card stack">
          <h3>{t('choose.dormTitle')}</h3>
          <p className="muted small">{t('choose.dormHint')}</p>
          <PlaceFields value={place} onChange={setPlace} />
        </div>
      )}
      {choice === 'order' && userType && userType !== 'student' && (
        <p className="muted small">{t('choose.placeEachTime')}</p>
      )}

      <button className="btn btn--block" disabled={busy || !userType || !choice || (needsPlace && !isPlaceReady(place))} onClick={go}>
        {busy ? t('common.saving') : t('choose.continue')}
      </button>
      <p className="muted small" style={{ textAlign: 'center' }}>
        {t('choose.later')}
      </p>
    </div>
  );
}
