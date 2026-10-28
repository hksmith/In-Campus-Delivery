import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { dateTime, money } from '../../lib/format.js';
import { PAYMENT_METHODS } from '../../lib/constants.js';
import { useSocketEvent } from '../../lib/socket.js';
import { toast } from '../../lib/toast.js';
import { useT } from '../../i18n/index.js';
import { Async, Field, ImageUpload, Rating, Sheet, StatGrid, StatusBadge } from '../../components/ui.jsx';

const TX_TONE = { pending: 'warn', approved: 'ok', rejected: 'bad' };

/** One line in a wallet history list (also used by the admin ledger) */
export function TxRow({ tx }) {
  const t = useT();
  return (
    <div className="order-row">
      <div>
        <strong>{t(`we.t.${tx.type}`)}</strong>
        <div className="muted small">
          {dateTime(tx.createdAt)}
          {tx.reference ? ` · ${tx.reference}` : ''}
          {tx.note ? ` · ${tx.note}` : ''}
          {tx.rejectionReason ? ` · ${tx.rejectionReason}` : ''}
        </div>
      </div>
      <div className="order-row__right">
        <strong className={tx.amount < 0 ? 'neg' : 'pos'}>
          {tx.amount > 0 ? '+' : ''}
          {money(tx.amount)}
        </strong>
        {tx.type === 'topup' && <span className={`badge badge--${TX_TONE[tx.status]}`}>{t(`we.s.${tx.status}`)}</span>}
      </div>
    </div>
  );
}

const AUTO = ['telebirr', 'cbe'];

/** Where to send the money – comes from the server .env (TELEBIRR_RECEIVER_* / CBE_RECEIVER_*) */
function PayTo({ wallet, method }) {
  const t = useT();
  const p = wallet.payTo || {};
  if (method === 'telebirr' && p.telebirr) {
    return (
      <div className="pay-to">
        <span className="muted small">{t('we.sendTo')}</span>
        <strong>{p.telebirr.phone}</strong>
        <span>{p.telebirr.name}</span>
      </div>
    );
  }
  if (method === 'cbe' && p.cbe) {
    return (
      <div className="pay-to">
        <span className="muted small">{t('we.sendTo')}</span>
        <strong>{p.cbe.account}</strong>
        <span>{p.cbe.name}</span>
      </div>
    );
  }
  return <div className="pre small">{wallet.paymentInstructions || t('we.noInstructions')}</div>;
}

function TopUpSheet({ wallet, onClose, onDone }) {
  const t = useT();
  const methods = [
    ...(wallet.payTo?.telebirr ? ['telebirr'] : []),
    ...(wallet.payTo?.cbe ? ['cbe'] : []),
    'cash',
    'other',
  ];
  const [form, setForm] = useState({ method: methods[0], reference: '', accountSuffix: '', amount: '', proofImage: '' });
  const [result, setResult] = useState(null);
  const [busy, run] = useAction();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const auto = AUTO.includes(form.method) && wallet.payTo?.automatic;

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const { data } = await api.post('/driver/wallet/topups', {
        ...form,
        reference: form.reference.trim().toUpperCase(),
        amount: Number(form.amount) || undefined,
      });
      setResult(data);
      onDone();
      if (data.outcome === 'verified') {
        toast.success(t('we.ok', { amount: money(data.transaction.amount) }));
        onClose();
      }
    });
  };

  if (result && result.outcome !== 'verified') {
    const bad = result.outcome === 'failed';
    return (
      <Sheet open title={t('we.topUp')} onClose={onClose}>
        <div className={`banner ${bad ? 'banner--bad' : 'banner--warn'}`}>
          <strong>{bad ? t('we.failed') : t('we.review')}</strong>
          {result.reason && <div className="small">{result.reason}</div>}
        </div>
        <button className="btn btn--block" onClick={() => (bad ? setResult(null) : onClose())}>
          {bad ? t('common.tryAgain') : t('common.ok')}
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet open title={t('we.topUp')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label={t('we.method')}>
          <div className="row row--wrap">
            {methods.map((m) => (
              <button
                type="button"
                key={m}
                className={`chip ${form.method === m ? 'chip--active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, method: m }))}
              >
                {t(`we.m.${m}`)}
              </button>
            ))}
          </div>
        </Field>

        <div className="banner banner--info small stack stack--sm">
          <strong>1️⃣ {t('we.step1', { amount: money(wallet.minTopUp) })}</strong>
          <PayTo wallet={wallet} method={form.method} />
          <strong>2️⃣ {auto ? t('we.step2auto') : t('we.step2manual')}</strong>
        </div>

        {form.method !== 'cash' && (
          <Field label={t('we.txId')} hint={form.method === 'cbe' ? t('we.txIdHintCbe') : t('we.txIdHint')}>
            <input
              className="input input--mono"
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value.toUpperCase().replace(/\s/g, '') }))}
              placeholder={form.method === 'cbe' ? 'FT25123ABC45' : 'CJK4ABC12D'}
              required
              autoCapitalize="characters"
            />
          </Field>
        )}
        {form.method === 'cbe' && (
          <Field label={t('we.suffix')} hint={t('we.suffixHint')}>
            <input className="input" inputMode="numeric" maxLength={8} value={form.accountSuffix} onChange={set('accountSuffix')} />
          </Field>
        )}
        {!auto && (
          <>
            <Field label={t('we.amount')} hint={t('we.min', { amount: money(wallet.minTopUp) })}>
              <input className="input" type="number" min={wallet.minTopUp} value={form.amount} onChange={set('amount')} required />
            </Field>
            <ImageUpload label={t('we.proof')} value={form.proofImage} onChange={(proofImage) => setForm((f) => ({ ...f, proofImage }))} />
          </>
        )}
        <button className="btn btn--block" disabled={busy}>
          {busy ? (auto ? t('we.checking') : t('common.sending')) : auto ? t('we.verify') : t('we.submit')}
        </button>
      </form>
    </Sheet>
  );
}

function WalletCard() {
  const t = useT();
  const { data, loading, error, reload } = useApi('/driver/wallet');
  const [open, setOpen] = useState(false);
  useSocketEvent('me:updated', () => reload());

  return (
    <Async loading={loading} error={error} reload={reload}>
      {data && (
        <>
          <div className="card stack stack--sm">
            <div className="row row--between">
              <h3>💳 {t('we.wallet')}</h3>
              <button className="btn btn--sm" onClick={() => setOpen(true)}>
                {t('we.topUp')}
              </button>
            </div>
            {data.wallet.isLow && (
              <div className="banner banner--bad small">{t('we.lowBanner', { amount: money(data.wallet.lowBalanceAlert) })}</div>
            )}
            <div className="wallet-balance">
              <span className="muted small">{t('we.balance')}</span>
              <strong className={data.wallet.balance < 0 ? 'neg' : ''}>{money(data.wallet.balance)}</strong>
            </div>
            <div className="sum-row small">
              <span>{t('we.reserved')}</span>
              <span>−{money(data.wallet.reserved)}</span>
            </div>
            <div className="sum-row sum-row--total">
              <span>{t('we.available')}</span>
              <span>{money(data.wallet.available)}</span>
            </div>
            {data.wallet.creditLimit > 0 && (
              <p className="muted small">{t('we.credit', { amount: money(data.wallet.creditLimit) })}</p>
            )}
            <p className="muted small">{t('we.why')}</p>
          </div>

          <h3 className="section-title">{t('we.history')}</h3>
          <div className="stack stack--sm">
            {data.transactions.length ? (
              data.transactions.map((tx) => <TxRow key={tx._id} tx={tx} />)
            ) : (
              <p className="muted small">{t('we.noHistory')}</p>
            )}
          </div>
          {open && <TopUpSheet wallet={data.wallet} onClose={() => setOpen(false)} onDone={reload} />}
        </>
      )}
    </Async>
  );
}

export default function DriverEarnings() {
  const t = useT();
  const earnings = useApi('/driver/earnings');
  const history = useApi('/driver/history');
  const e = earnings.data;

  return (
    <div className="page stack">
      <h2>{t('we.title')}</h2>
      <WalletCard />

      <h3 className="section-title">{t('we.earnings')}</h3>
      <Async loading={earnings.loading} error={earnings.error} reload={earnings.reload}>
        {e && (
          <>
            <StatGrid
              items={[
                { label: t('we.today'), value: money(e.today.earnings) },
                { label: t('we.deliveriesToday'), value: e.today.deliveries },
                { label: t('we.thisWeek'), value: money(e.week.earnings) },
                { label: t('we.rating'), value: <Rating value={e.rating} count={e.ratingCount} /> },
              ]}
            />
            <div className="card">
              <div className="sum-row">
                <span>{t('we.last30', { n: e.month.deliveries })}</span>
                <span>{money(e.month.earnings)}</span>
              </div>
              <div className="sum-row">
                <span>{t('we.allTime', { n: e.allTime.deliveries })}</span>
                <span>{money(e.allTime.earnings)}</span>
              </div>
            </div>
          </>
        )}
      </Async>

      <h3 className="section-title">{t('we.trips')}</h3>
      <Async loading={history.loading} error={history.error} reload={history.reload}>
        <div className="stack stack--sm">
          {history.data?.orders?.map((o) => (
            <div key={o._id} className="order-row">
              <div>
                <strong>#{o.orderNumber}</strong> · {o.cafe?.name}
                <div className="muted small">
                  {o.delivery?.locationName} · {dateTime(o.deliveredAt || o.updatedAt)}
                </div>
              </div>
              <div className="order-row__right">
                <StatusBadge status={o.status} />
                {o.status === 'delivered' && <span className="small">+{money(o.driverEarning)}</span>}
              </div>
            </div>
          ))}
          {!history.data?.orders?.length && <p className="muted small">{t('we.noTrips')}</p>}
        </div>
      </Async>
    </div>
  );
}
