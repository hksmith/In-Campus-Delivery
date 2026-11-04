/**
 * Smaller images: Cloudinary resizes on the fly when the size is in the URL.
 * Photos are stored at up to 1200px, but a menu thumbnail is ~88px on screen –
 * asking for the right size downloads 5–10× less.
 *
 *   <img src={sized(item.image, 88, 88)} />
 *
 * Non-Cloudinary URLs (Telegram profile photos etc.) are returned unchanged.
 */
const DPR = 2; // phone screens are sharp – fetch 2× the CSS size

export function sized(url, width, height, { crop = 'fill' } = {}) {
  if (!url || typeof url !== 'string') return url;
  const marker = '/image/upload/';
  const at = url.indexOf(marker);
  if (!url.includes('res.cloudinary.com') || at === -1) return url;
  const parts = [`w_${Math.round(width * DPR)}`];
  if (height) parts.push(`h_${Math.round(height * DPR)}`, `c_${crop}`, 'g_auto');
  else parts.push('c_limit');
  parts.push('f_auto', 'q_auto');
  const start = at + marker.length;
  return `${url.slice(0, start)}${parts.join(',')}/${url.slice(start)}`;
}
