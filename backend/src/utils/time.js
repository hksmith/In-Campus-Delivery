/**
 * Small timezone helpers so "today", opening hours etc. follow the campus
 * timezone (TIMEZONE env) no matter where the server is hosted.
 */

function partsInTz(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/** Offset (ms) of the timezone from UTC at the given instant */
export function tzOffsetMs(date, timeZone) {
  const p = partsInTz(date, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Start of the local day (in timeZone), `daysAgo` days back, as a UTC Date */
export function startOfDay(timeZone, daysAgo = 0) {
  const now = new Date();
  const offset = tzOffsetMs(now, timeZone);
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() - daysAgo);
  return new Date(local.getTime() - offset);
}

export function minutesNowInTz(timeZone) {
  const p = partsInTz(new Date(), timeZone);
  return +p.hour * 60 + +p.minute;
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return h * 60 + m;
};

/** True if "now" is between open and close (supports overnight hours like 18:00–02:00) */
export function isWithinHours(open, close, timeZone) {
  const now = minutesNowInTz(timeZone);
  const o = toMinutes(open);
  const c = toMinutes(close);
  if (o === c) return true; // open 24h
  return o < c ? now >= o && now < c : now >= o || now < c;
}
