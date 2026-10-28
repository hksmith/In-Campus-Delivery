import { Link } from 'react-router-dom';
import { useT } from '../../i18n/index.js';

export default function AdminMore() {
  const t = useT();
  return (
    <div className="page stack">
      <h2>{t('am.title')}</h2>
      <Link to="/admin/locations" className="list-link">
        {t('am.locations')} <span className="muted small">{t('am.locationsSub')}</span>
      </Link>
      <Link to="/admin/settings" className="list-link">
        {t('am.settings')} <span className="muted small">{t('am.settingsSub')}</span>
      </Link>
      <Link to="/admin/broadcast" className="list-link">
        {t('am.broadcast')} <span className="muted small">{t('am.broadcastSub')}</span>
      </Link>
      <Link to="/profile" className="list-link">
        {t('am.myProfile')}
      </Link>
    </div>
  );
}
