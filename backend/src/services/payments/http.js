import http from 'node:http';
import https from 'node:https';
import { env } from '../../config/env.js';

/** Thrown when the receipt site can't be reached (network, geo-block, timeout) – NOT when the receipt is invalid */
export class UnreachableError extends Error {
  constructor(message) {
    super(message);
    this.unreachable = true;
  }
}

/** Thrown when the provider says the receipt does not exist */
export class NotFoundError extends Error {}

const ALLOWED_HOSTS = ['transactioninfo.ethiotelecom.et', 'apps.cbe.com.et'];

function rawGet(url, { insecure = false, timeout = 20000, redirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    // The relay on your own VPS may be plain http://; Telebirr/CBE are always https://
    const client = url.startsWith('http://') ? http : https;
    const req = client.get(
      url,
      {
        rejectUnauthorized: !insecure,
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html,application/pdf,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,am;q=0.8',
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          rawGet(next, { insecure, timeout, redirects: redirects - 1 }).then(resolve, reject);
          return;
        }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > 5 * 1024 * 1024) req.destroy(new Error('Response too large'));
          else chunks.push(c);
        });
        res.on('end', () =>
          resolve({ status: res.statusCode, contentType: res.headers['content-type'] || '', body: Buffer.concat(chunks) })
        );
      }
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
  });
}

/**
 * Downloads an official receipt (Telebirr HTML or CBE PDF).
 * If VERIFY_RELAY_URL is set, the request goes through your relay hosted inside Ethiopia,
 * because both sites usually block servers abroad.
 */
export async function fetchReceipt(url) {
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.includes(host)) throw new Error(`Host not allowed: ${host}`);

  let target = url;
  let via = 'direct';
  if (env.VERIFY_RELAY_URL) {
    const relay = new URL(env.VERIFY_RELAY_URL);
    relay.searchParams.set('key', env.VERIFY_RELAY_KEY);
    relay.searchParams.set('url', url);
    target = relay.toString();
    via = 'relay';
  }

  let res;
  try {
    res = await rawGet(target, { insecure: env.RECEIPT_TLS_INSECURE && via === 'direct' });
  } catch (err) {
    const hint = /certificate|self.signed|UNABLE_TO_VERIFY/i.test(err.message)
      ? ' (certificate problem – see RECEIPT_TLS_INSECURE in .env.example)'
      : '';
    throw new UnreachableError(`Could not reach ${host}: ${err.message}${hint}`);
  }

  if (via === 'relay' && res.status === 403) throw new UnreachableError('Relay rejected the key (check VERIFY_RELAY_KEY)');
  if (res.status === 404) throw new NotFoundError('Receipt not found');
  if (res.status >= 500 || res.status === 403 || res.status === 429) {
    throw new UnreachableError(`${host} answered HTTP ${res.status}`);
  }
  if (res.status !== 200) throw new NotFoundError(`Receipt not available (HTTP ${res.status})`);
  if (!res.body.length) throw new UnreachableError(`${host} returned an empty page`);
  return { ...res, via };
}
