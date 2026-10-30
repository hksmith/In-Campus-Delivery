/**
 * Tapping a phone number anywhere opens a small menu (rendered by <ContactHost />):
 *   📞 Call (phone app)   💬 Message on Telegram (if we know their username)   📋 Copy number
 * Telegram's in-app browser often ignores tel: links on desktop, so Copy is always there too.
 */
const listeners = new Set();

/** 0912345678 / 912345678 / 251912345678 → +251912345678 (other formats are left as typed) */
export function toInternational(phone) {
  const p = String(phone || '').replace(/[\s()-]/g, '');
  if (/^\+\d{7,15}$/.test(p)) return p;
  if (/^0[79]\d{8}$/.test(p)) return `+251${p.slice(1)}`;
  if (/^[79]\d{8}$/.test(p)) return `+251${p}`;
  if (/^251[79]\d{8}$/.test(p)) return `+${p}`;
  return p;
}

export function openContact({ phone, username, name } = {}) {
  if (!phone && !username) return;
  listeners.forEach((l) => l({ phone, username: username?.replace(/^@/, ''), name }));
}

export function subscribeContact(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older Telegram web views: fall back to a hidden text box
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    el.remove();
    return ok;
  }
}
