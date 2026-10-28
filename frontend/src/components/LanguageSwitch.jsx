import { useAuth } from '../context/AuthContext.jsx';
import { LANGUAGES, setLanguage, useLanguage } from '../i18n/index.js';

/** EN | አማ segmented switch. Saves to the profile when logged in. */
export default function LanguageSwitch({ compact = false }) {
  const lang = useLanguage();
  const auth = useAuth();
  const change = (code) => {
    if (auth?.user) auth.changeLanguage(code);
    else setLanguage(code);
  };
  return (
    <div className={`lang-switch ${compact ? 'lang-switch--compact' : ''}`}>
      {LANGUAGES.map((l) => (
        <button key={l.code} className={lang === l.code ? 'active' : ''} onClick={() => change(l.code)}>
          {compact ? (l.code === 'en' ? 'EN' : 'አማ') : l.label}
        </button>
      ))}
    </div>
  );
}
