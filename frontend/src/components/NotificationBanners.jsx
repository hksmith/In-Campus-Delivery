import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext.jsx';
import { useT } from '../i18n/index.js';
import Icon from './Icon.jsx';

/** The dark message that slides down from the top when something new happens */
export default function NotificationBanners() {
  const t = useT();
  const navigate = useNavigate();
  const { banners, dismiss } = useNotifications();
  if (!banners.length) return null;

  return (
    <div className="nbanners" role="status" aria-live="polite">
      {banners.map((b) => {
        const open = () => {
          dismiss(b.id);
          if (b.to) navigate(b.to);
        };
        return (
          <div key={b.id} className="nbanner">
            <button type="button" className="nbanner__main" onClick={open}>
              <span className={`nbanner__icon nbanner__icon--${b.tone || 'brand'}`}>
                <Icon name={b.icon || 'box'} size={20} />
              </span>
              <span className="nbanner__body">
                <span className="nbanner__title">{b.title}</span>
                {b.text && <span className="nbanner__text">{b.text}</span>}
              </span>
            </button>
            {b.action && (
              <button type="button" className="nbanner__action" onClick={open}>
                {b.action}
              </button>
            )}
            <button type="button" className="nbanner__close" onClick={() => dismiss(b.id)} aria-label={t('nt.close')}>
              <Icon name="x" size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
