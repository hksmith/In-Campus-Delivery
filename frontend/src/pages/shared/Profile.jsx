import { Link } from 'react-router-dom';
import { api, getDevTelegramId, setDevTelegramId } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { isInTelegram } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/index.js';
import { Rating, Toggle } from '../../components/ui.jsx';
import LanguageSwitch from '../../components/LanguageSwitch.jsx';
import ProfileForm from './ProfileForm.jsx';

function DriverStatusCard() {
  const t = useT();
  const { user, setUser } = useAuth();
  const [busy, run] = useAction();
  const dp = user.driverProfile || {};
  if (user.role !== 'driver') return null;

  const setOnline = (isOnline) =>
    run(async () => {
      const { data } = await api.patch('/driver/status', { isOnline });
      setUser(data.user);
      toast.success(isOnline ? t('profile.onlineToast') : t('profile.offlineToast'));
    });

  return (
    <div className="card">
      <div className="row row--between">
        <div>
          <strong>{t('profile.driverStatus')}</strong>
          <div className="muted small">
            {dp.status === 'approved' ? (
              <>
                {t('profile.deliveries', { n: dp.totalDeliveries || 0 })} · <Rating value={dp.rating} count={dp.ratingCount} />
              </>
            ) : (
              t('profile.account', { status: t(`ap.f.${dp.status}`) })
            )}
          </div>
        </div>
        <Toggle checked={dp.isOnline} disabled={busy || dp.status !== 'approved'} onChange={setOnline} />
      </div>
    </div>
  );
}

function Opportunities() {
  const t = useT();
  const { user } = useAuth();
  const { data } = useApi(user.role === 'customer' ? '/users/me/cafe-application' : null);
  if (user.role !== 'customer') return null;

  const dp = user.driverProfile || {};
  const cafe = data?.cafe;
  const reasonText = (r) => (r ? `: ${r}` : '');

  return (
    <div className="card stack">
      <strong>{t('profile.workWithUs')}</strong>
      {dp.status === 'pending' ? (
        <div className="banner banner--info">{t('profile.driverPending')}</div>
      ) : (
        <>
          {dp.status === 'rejected' && (
            <div className="banner banner--bad">{t('profile.driverRejected', { reason: reasonText(dp.rejectionReason) })}</div>
          )}
          {!cafe || cafe.status === 'rejected' ? (
            <Link to="/apply/driver" className="list-link">
              {t('profile.becomeDriver')} <span className="muted small">{t('profile.becomeDriverSub')}</span>
            </Link>
          ) : null}
        </>
      )}

      {cafe?.status === 'pending' && <div className="banner banner--info">{t('profile.cafePending', { name: cafe.name })}</div>}
      {cafe?.status === 'rejected' && (
        <div className="banner banner--bad">
          {t('profile.cafeRejected', { name: cafe.name, reason: reasonText(cafe.rejectionReason) })}
        </div>
      )}
      {(!cafe || cafe.status === 'rejected') && dp.status !== 'pending' && (
        <Link to="/apply/cafe" className="list-link">
          {t('profile.registerCafe')} <span className="muted small">{t('profile.registerCafeSub')}</span>
        </Link>
      )}
    </div>
  );
}

function DevSwitcher() {
  const t = useT();
  if (isInTelegram || !import.meta.env.DEV) return null;
  const current = getDevTelegramId();
  const switchTo = (id) => {
    setDevTelegramId(id);
    window.location.href = '/';
  };
  return (
    <div className="card stack">
      <strong>{t('profile.devSwitch')}</strong>
      <div className="row row--wrap">
        {[
          ['1000002', 'Student'],
          ['1000001', 'Cafe owner'],
          ['1000003', 'Driver ♂'],
          ['1000005', 'Driver ♀'],
          ['1000004', 'Admin'],
        ].map(([id, label]) => (
          <button key={id} className={`chip ${current === id ? 'chip--active' : ''}`} onClick={() => switchTo(id)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Profile() {
  const t = useT();
  const { user } = useAuth();
  return (
    <div className="page stack">
      <div className="profile-head">
        {user.photoUrl ? (
          <img src={user.photoUrl} alt="" className="avatar avatar--lg" />
        ) : (
          <div className="avatar avatar--lg">{(user.fullName || user.firstName || '?')[0]}</div>
        )}
        <div>
          <h2>{user.fullName || user.firstName}</h2>
          <div className="muted small">
            {user.username ? `@${user.username} · ` : ''}
            {t(`role.${user.role}`)}
          </div>
        </div>
      </div>

      <div className="card row row--between">
        <strong>{t('common.language')}</strong>
        <LanguageSwitch />
      </div>

      <DriverStatusCard />
      <Opportunities />

      <div className="card">
        <h3>{t('profile.myDetails')}</h3>
        <ProfileForm onSaved={() => toast.success(t('profile.saved'))} />
      </div>

      <DevSwitcher />
    </div>
  );
}
