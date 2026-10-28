/**
 * Optional paid provider: Verify.ET (https://verify.et/docs/api).
 * Works from servers outside Ethiopia and understands new CBE mobile receipt links.
 * Response fields are mapped defensively – test with a real key before going live.
 */
import { env } from '../../config/env.js';
import { NotFoundError, UnreachableError } from './http.js';

export async function fetchViaVerifyEt({ method, reference, settlementAccount }) {
  if (!env.VERIFYET_API_KEY) throw new UnreachableError('VERIFYET_API_KEY is not set');
  const body = { bank: method === 'cbe' ? 'cbe' : 'telebirr', reference };
  if (settlementAccount) body.settlementAccount = settlementAccount;

  let res;
  try {
    res = await fetch(`${env.VERIFYET_BASE_URL}/api/verify?waitMs=20000`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.VERIFYET_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new UnreachableError(`Verify.ET not reachable: ${err.message}`);
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 202) throw new UnreachableError('Verify.ET is still checking – try again in a minute');
  if (res.status === 401 || res.status === 402 || res.status === 403 || res.status === 429 || res.status >= 500) {
    throw new UnreachableError(`Verify.ET error ${res.status}: ${json.message || ''}`.trim());
  }
  const d = json?.data?.verification || json?.data || json?.verification || {};
  if (!res.ok || json.success === false || d.verified === false) {
    throw new NotFoundError(json.message || d.message || 'Receipt could not be verified');
  }
  return {
    provider: method,
    via: 'verifyet',
    payerName: d.senderName || '',
    payerAccount: d.senderAccount || '',
    receiverName: d.receiverName || '',
    receiverAccount: d.receiverAccount || '',
    status: d.status || 'Completed',
    reference: d.referenceNumber || d.receiptNumber || reference,
    amount: d.amount != null ? Number(d.amount) : null,
    date: d.timestamp ? new Date(d.timestamp) : null,
  };
}
