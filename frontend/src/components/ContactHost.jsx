import { useEffect, useState } from 'react';
import { copyText, openContact, subscribeContact, toInternational } from '../lib/contact.js';
import { haptic, openTelegramUser } from '../lib/telegram.js';
import { toast } from '../lib/toast.js';
import { useT } from '../i18n/index.js';
import { Sheet } from './ui.jsx';

/** The "Call / Message on Telegram / Copy number" menu opened by callPhone() / <PhoneLink /> */
export default function ContactHost() {
  const t = useT();
  const [who, setWho] = useState(null);
  useEffect(() => subscribeContact(setWho), []);
  if (!who) return null;

  const close = () => setWho(null);
  const tel = who.phone ? toInternational(who.phone) : '';

  const copy = async () => {
    if (await copyText(tel)) {
      haptic.success?.();
      toast.success(t('contact.copied'));
    } else {
      toast.error(t('contact.copyFailed', { phone: tel }));
    }
    close();
  };

  return (
    <Sheet open title={who.name || tel || `@${who.username}`} onClose={close}>
      <div className="stack">
        {tel && <div className="contact-number">{tel}</div>}
        {tel && (
          // A real link works best in Telegram's in-app browser (opens the phone app)
          <a className="btn btn--block" href={`tel:${tel}`} onClick={() => setTimeout(close, 300)}>
            📞 {t('contact.call')}
          </a>
        )}
        {who.username && (
          <button
            className="btn btn--secondary btn--block"
            onClick={() => {
              openTelegramUser(who.username);
              close();
            }}
          >
            💬 {t('contact.telegram', { username: who.username })}
          </button>
        )}
        {tel && (
          <button className="btn btn--secondary btn--block" onClick={copy}>
            📋 {t('contact.copy')}
          </button>
        )}
        {who.username && <p className="muted small">{t('contact.telegramCallHint')}</p>}
      </div>
    </Sheet>
  );
}

/** A tappable phone number: shows the number and opens the contact menu */
export function PhoneLink({ phone, username, name, className = 'link' }) {
  if (!phone) return null;
  return (
    <button type="button" className={className} onClick={() => openContact({ phone, username, name })}>
      📞 {phone}
    </button>
  );
}
