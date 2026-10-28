/**
 * Telebirr receipt check.
 * Every Telebirr payment has a public receipt page:
 *   https://transactioninfo.ethiotelecom.et/receipt/<TRANSACTION_ID>
 * The transaction ID (e.g. CJK4ABC12D) is in the SMS the payer receives.
 *
 * The page is a bilingual HTML table: a label cell like "የከፋይ ስም/Payer Name" followed by the value cell.
 * Field labels follow the open-source verifier-api project (MIT, github.com/Vixen878/verifier-api).
 */
import { fetchReceipt, NotFoundError } from './http.js';

export const TELEBIRR_REF_RE = /^[A-Z0-9]{8,14}$/;

const decode = (s) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** Value of the <td> that follows the <td> containing `label` (English part of the label is enough) */
function afterLabel(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const re = new RegExp(`${escaped}[^<]*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
  const m = html.match(re);
  return m ? decode(m[1]) : '';
}

const toNumber = (s) => {
  const m = String(s || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

function settledAmount(html) {
  const patterns = [
    /Settled\s+Amount[\s\S]*?<\/td>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)\s*Birr/i,
    // Amount sits in the 3rd cell of the row under the "Transaction details" header
    /Transaction\s+details[\s\S]*?<tr[^>]*>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)\s*Birr/i,
    /Settled\s+Amount[\s\S]{0,400}?([\d,]+\.\d{2})\s*Birr/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return toNumber(m[1]);
  }
  return null;
}

/** Telebirr shows local Addis time as DD-MM-YYYY HH:MM:SS */
function parseDate(html) {
  const m = html.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseTelebirrHtml(html) {
  let receiverName = afterLabel(html, 'Credited Party name');
  let receiverAccount = afterLabel(html, 'Credited party account no');
  // Telebirr → bank transfer: the "credited party" is the bank and the real account is listed separately
  const bankRaw = afterLabel(html, 'Bank account number');
  let bankName = '';
  if (bankRaw) {
    bankName = receiverName;
    const m = bankRaw.match(/(\d+)\s+(.*)/);
    if (m) {
      receiverAccount = m[1];
      receiverName = m[2];
    }
  }
  const receiptNo =
    // Receipt numbers are UPPERCASE letters + digits (must contain a digit, so words like "Completed" don't match)
    (html.match(/class="[^"]*receipttableTd2[^"]*"[^>]*>\s*((?=[A-Z0-9]*\d)[A-Z0-9]{8,14})\s*<\/td>/) || [])[1] ||
    afterLabel(html, 'Invoice No');

  return {
    provider: 'telebirr',
    payerName: afterLabel(html, 'Payer Name'),
    payerAccount: afterLabel(html, 'Payer telebirr no'),
    receiverName,
    receiverAccount,
    bankName,
    status: afterLabel(html, 'transaction status'),
    reference: receiptNo,
    amount: settledAmount(html),
    date: parseDate(html),
  };
}

export async function fetchTelebirrReceipt(reference) {
  const ref = String(reference).trim().toUpperCase();
  if (!TELEBIRR_REF_RE.test(ref)) throw new NotFoundError('A Telebirr transaction ID has 10 letters/numbers, e.g. CJK4ABC12D');
  const res = await fetchReceipt(`https://transactioninfo.ethiotelecom.et/receipt/${ref}`);
  const html = res.body.toString('utf8');
  const receipt = parseTelebirrHtml(html);
  if (!receipt.payerName && !receipt.amount) throw new NotFoundError('Telebirr has no receipt with this transaction ID');
  return { ...receipt, via: res.via };
}
