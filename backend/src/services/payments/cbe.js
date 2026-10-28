/**
 * CBE (Commercial Bank of Ethiopia) receipt check.
 * Every CBE transfer has a public PDF receipt:
 *   https://apps.cbe.com.et:100/?id=<FT REFERENCE><LAST 8 DIGITS OF AN ACCOUNT>
 * The FT reference (e.g. FT25123ABC45) is on the SMS / receipt.
 * We first try the last 8 digits of OUR receiving account, then the payer's if the driver gave them.
 */
// Import the library file directly – the package root runs a debug test when imported as ESM
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { fetchReceipt, NotFoundError } from './http.js';

export const CBE_REF_RE = /^FT[A-Z0-9]{10}$/;

const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Parse the text extracted from a CBE receipt PDF */
export function parseCbeText(rawText) {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim();
  const accounts = [...text.matchAll(/Account\s*:?\s*([0-9]?\*+\d{3,4}|\d{8,16})/gi)].map((m) => m[1]);
  const amountText = (text.match(/Transferred Amount\s*:?\s*([\d,]+(?:\.\d{2})?)\s*ETB/i) || [])[1];
  const dateRaw = (text.match(/Payment Date\s*&\s*Time\s*:?\s*([\d/]+,?\s*\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)/i) || [])[1];

  let date = null;
  if (dateRaw) {
    // e.g. 10/27/2025, 9:12:44 AM – local Addis time
    const m = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)/i);
    if (m) {
      let h = Number(m[4]) % 12;
      if (m[7].toUpperCase() === 'PM') h += 12;
      const pad = (n) => String(n).padStart(2, '0');
      date = new Date(`${m[3]}-${pad(m[1])}-${pad(m[2])}T${pad(h)}:${m[5]}:${pad(m[6] || 0)}+03:00`);
      if (Number.isNaN(date.getTime())) date = null;
    }
  }

  return {
    provider: 'cbe',
    payerName: titleCase((text.match(/Payer\s*:?\s*(.*?)\s+Account/i) || [])[1]?.trim()),
    payerAccount: accounts[0] || '',
    receiverName: titleCase((text.match(/Receiver\s*:?\s*(.*?)\s+Account/i) || [])[1]?.trim()),
    receiverAccount: accounts[1] || '',
    status: text ? 'Completed' : '', // CBE only issues a receipt for completed transfers
    reference: (text.match(/Reference No\.?\s*\(VAT Invoice No\)\s*:?\s*([A-Z0-9]+)/i) || [])[1] || '',
    amount: amountText ? Number(amountText.replace(/,/g, '')) : null,
    date,
    reason: (text.match(/Reason\s*\/\s*Type of service\s*:?\s*(.*?)\s+Transferred Amount/i) || [])[1]?.trim() || '',
  };
}

async function tryFetch(reference, suffix) {
  const res = await fetchReceipt(`https://apps.cbe.com.et:100/?id=${reference}${suffix}`);
  if (!/pdf/i.test(res.contentType) && res.body.slice(0, 4).toString() !== '%PDF') {
    throw new NotFoundError('CBE has no receipt for this reference');
  }
  const { text } = await pdfParse(res.body);
  const receipt = parseCbeText(text);
  if (!receipt.amount || !receipt.receiverName) throw new NotFoundError('Could not read the CBE receipt');
  return { ...receipt, via: res.via };
}

/**
 * @param {string} reference FT reference
 * @param {string[]} suffixes candidate account suffixes (8 digits) to try in order
 */
export async function fetchCbeReceipt(reference, suffixes) {
  const ref = String(reference).trim().toUpperCase();
  if (!CBE_REF_RE.test(ref)) throw new NotFoundError('A CBE reference starts with FT and has 12 characters, e.g. FT25123ABC45');
  const tried = [...new Set(suffixes.filter((s) => /^\d{8}$/.test(s)))];
  if (!tried.length) throw new NotFoundError('Enter the last 8 digits of the account you paid from');
  let lastErr;
  for (const suffix of tried) {
    try {
      return await tryFetch(ref, suffix);
    } catch (err) {
      lastErr = err;
      if (err.unreachable) throw err; // network problem – no point trying other suffixes
    }
  }
  throw lastErr;
}
