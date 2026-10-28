import { setDevTelegramId } from '../../lib/api.js';
import { useT } from '../../i18n/index.js';
import LanguageSwitch from '../../components/LanguageSwitch.jsx';

export function NotInTelegram() {
  const t = useT();
  const isDev = import.meta.env.DEV;
  return (
    <div className="screen-center">
      <LanguageSwitch />
      <div className="empty__icon">📱</div>
      <h2>{t('screen.openInTelegram')}</h2>
      <p className="muted">{t('screen.openInTelegramText')}</p>
      {isDev && (
        <div className="card" style={{ marginTop: 24, textAlign: 'left' }}>
          <strong>{t('screen.devLogin')}</strong>
          <p className="muted small">
            Backend needs <code>DEV_AUTH_BYPASS=true</code>. Run <code>npm run seed -- --demo</code> then pick a role:
          </p>
          <div className="stack">
            {[
              ['1000002', '🎓 Student'],
              ['1000001', '🏪 Cafe owner'],
              ['1000003', '🛵 Driver (male)'],
              ['1000005', '🛵 Driver (female)'],
              ['1000004', '🛡 Admin'],
            ].map(([id, label]) => (
              <button
                key={id}
                className="btn btn--secondary"
                onClick={() => {
                  setDevTelegramId(id);
                  window.location.href = '/';
                }}
              >
                {label} ({id})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function BlockedScreen({ message, onRetry }) {
  const t = useT();
  return (
    <div className="screen-center">
      <div className="empty__icon">⚠️</div>
      <p>{message}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          {t('common.tryAgain')}
        </button>
      )}
    </div>
  );
}
