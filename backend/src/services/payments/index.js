/**
 * Automatic top-up verification.
 *
 * The driver types only the transaction ID from their payment SMS. We download the OFFICIAL receipt
 * from Telebirr / CBE (never trust a screenshot) and check:
 *   1. the receipt exists and is completed
 *   2. the money went to OUR account (receiver name + last digits of the account/phone)
 *   3. it is recent (TOPUP_MAX_AGE_HOURS) and the reference on the receipt matches
 *   4. the amount is at least the minimum top-up
 * The wallet is credited with the amount ON THE RECEIPT, not what the driver typed.
 * The same transaction ID can only ever be used once (unique index in WalletTransaction).
 *
 * outcome:
 *   verified    – all checks passed → credit the wallet
 *   failed      – receipt missing or clearly not ours → reject
 *   review      – receipt is real but something needs a human (e.g. below minimum) → admin decides
 *   unavailable – Telebirr/CBE could not be reached → admin decides or re-checks later
 */
import { env } from '../../config/env.js';
import { fetchTelebirrReceipt } from './telebirr.js';
import { fetchCbeReceipt } from './cbe.js';
import { fetchViaVerifyEt } from './verifyet.js';

export const AUTO_METHODS = ['telebirr', 'cbe'];

const digits = (s) => String(s || '').replace(/\D/g, '');
const words = (s) =>
  String(s || '')
    .toUpperCase()
    .replace(/[^A-Zሀ-፿ ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

/** Every word of the configured name must appear in the receipt name ("Abebe Kebede" ⊂ "ABEBE KEBEDE TESFAYE") */
export function nameMatches(expected, actual) {
  const exp = words(expected);
  if (!exp.length) return null; // not configured
  const act = new Set(words(actual));
  return exp.every((w) => act.has(w));
}

/** Compare the visible last 4 digits (receipts mask the middle, e.g. 2519****5678 or 1****5678) */
export function accountMatches(expected, actual) {
  const e = digits(expected);
  const a = digits(actual);
  if (!e) return null;
  if (a.length < 4) return null; // receipt doesn't show it – rely on the name
  return e.slice(-4) === a.slice(-4);
}

function ourAccounts() {
  const list = [];
  if (env.TELEBIRR_RECEIVER_PHONE || env.TELEBIRR_RECEIVER_NAME) {
    list.push({ kind: 'telebirr', account: env.TELEBIRR_RECEIVER_PHONE, name: env.TELEBIRR_RECEIVER_NAME });
  }
  if (env.CBE_RECEIVER_ACCOUNT || env.CBE_RECEIVER_NAME) {
    list.push({ kind: 'cbe', account: env.CBE_RECEIVER_ACCOUNT, name: env.CBE_RECEIVER_NAME });
  }
  return list;
}

/** Public "where to pay" info shown to drivers */
export function payToDetails() {
  return {
    telebirr: env.TELEBIRR_RECEIVER_PHONE ? { phone: env.TELEBIRR_RECEIVER_PHONE, name: env.TELEBIRR_RECEIVER_NAME } : null,
    cbe: env.CBE_RECEIVER_ACCOUNT ? { account: env.CBE_RECEIVER_ACCOUNT, name: env.CBE_RECEIVER_NAME } : null,
    automatic: env.PAYMENT_VERIFIER !== 'off' && ourAccounts().length > 0,
  };
}

/** Pure rule check – exported for tests */
export function checkReceipt(receipt, { requestedRef, minAmount, maxAgeHours = env.TOPUP_MAX_AGE_HOURS, now = new Date() }) {
  const accounts = ourAccounts();
  if (!accounts.length) return { outcome: 'review', reason: 'Receiving account is not configured on the server' };

  if (receipt.status && !/complet|success/i.test(receipt.status)) {
    return { outcome: 'failed', reason: `Payment is not completed (status: ${receipt.status})` };
  }

  const ref = String(receipt.reference || '').toUpperCase();
  if (ref && requestedRef && !ref.startsWith(requestedRef.toUpperCase())) {
    // We fetched the receipt BY this reference, so a mismatch is more likely a reading problem than fraud
    return { outcome: 'review', reason: 'The receipt reference does not match' };
  }

  // Money must have gone to one of our accounts
  const toUs = accounts.some((acc) => {
    const n = nameMatches(acc.name, receipt.receiverName);
    const a = accountMatches(acc.account, receipt.receiverAccount);
    if (n === false || a === false) return false;
    return n === true || a === true;
  });
  if (!toUs) {
    return { outcome: 'failed', reason: 'This payment was not sent to our account' };
  }

  if (!receipt.date) return { outcome: 'review', reason: 'Payment date could not be read' };
  const ageHours = (now - receipt.date) / 3_600_000;
  if (ageHours > maxAgeHours) {
    return { outcome: 'failed', reason: `This payment is older than ${maxAgeHours} hours` };
  }
  if (ageHours < -24) return { outcome: 'failed', reason: 'Payment date is in the future' };

  if (!receipt.amount || receipt.amount <= 0) return { outcome: 'review', reason: 'Amount could not be read' };
  if (receipt.amount < minAmount) {
    return { outcome: 'review', reason: `Amount ${receipt.amount} is below the minimum top-up of ${minAmount}` };
  }

  return { outcome: 'verified', reason: '' };
}

async function fetchDirect({ method, reference, accountSuffix }) {
  if (method === 'telebirr') return fetchTelebirrReceipt(reference);
  const suffixes = [digits(env.CBE_RECEIVER_ACCOUNT).slice(-8), digits(accountSuffix).slice(-8)];
  return fetchCbeReceipt(reference, suffixes);
}

/**
 * Downloads and checks the receipt.
 * @returns {Promise<{outcome, reason, receipt, provider}>}
 */
export async function verifyTopUpReceipt({ method, reference, accountSuffix, minAmount }) {
  if (env.PAYMENT_VERIFIER === 'off' || !AUTO_METHODS.includes(method)) {
    return { outcome: 'review', reason: 'Manual approval', receipt: null, provider: 'manual' };
  }

  let receipt;
  try {
    receipt =
      env.PAYMENT_VERIFIER === 'verifyet'
        ? await fetchViaVerifyEt({
            method,
            reference,
            settlementAccount: method === 'cbe' ? env.CBE_RECEIVER_ACCOUNT : env.TELEBIRR_RECEIVER_PHONE,
          })
        : await fetchDirect({ method, reference, accountSuffix });
  } catch (err) {
    if (err.unreachable) {
      console.warn(`Receipt check unavailable (${method} ${reference}):`, err.message);
      return { outcome: 'unavailable', reason: err.message, receipt: null, provider: env.PAYMENT_VERIFIER };
    }
    return { outcome: 'failed', reason: err.message, receipt: null, provider: env.PAYMENT_VERIFIER };
  }

  const result = checkReceipt(receipt, { requestedRef: reference, minAmount });
  return { ...result, receipt, provider: receipt.via || env.PAYMENT_VERIFIER };
}
