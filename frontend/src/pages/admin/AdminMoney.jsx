import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { dateTime, money, personName } from '../../lib/format.js';
import { useSocketEvent } from '../../lib/socket.js';
import { callPhone, confirmDialog, promptDialog } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useT } from '../../i18n/index.js';
import { Async, Empty, Sheet, StatGrid, Tabs } from '../../components/ui.jsx';
import { TxRow } from '../driver/DriverEarnings.jsx';

const V_TONE = { verified: 'ok', failed: 'bad', review: 'warn', unavailable: 'warn', manual: 'info' };

/** What the automatic Telebirr / CBE receipt check found */
function VerificationInfo({ v }) {
  const t = useT();
  return (
    <div className="small stack stack--sm verify-box">
      <span>
        <span className={`badge badge--${V_TONE[v.status] || 'info'}`}>{t(`aw.v.${v.status}`)}</span>
        {v.reason ? ` ${v.reason}` : ''}
      </span>
      {(v.payerName || v.receiverName) && (
        <span className="muted">
          {t('aw.vFrom', { name: v.payerName || '—' })} → {t('aw.vTo', { name: v.receiverName || '—', account: v.receiverAccount || '' })}
        </span>
      )}
      {v.receiptAmount != null && (
        <span className="muted">
          {t('aw.vReceipt', { amount: money(v.receiptAmount), date: v.receiptDate ? dateTime(v.receiptDate) : '—' })}
        </span>
      )}
    </div>
  );
}

/** Top-up requests: driver says "I sent X with ref Y" → admin checks their account → approve/reject */
function TopUps({ status }) {
  const t = useT();
  const { data, loading, error, reload } = useApi('/admin/topups', { params: { status } });
  const [busy, run] = useAction();
  useSocketEvent('admin:topups', () => reload());

  const approve = async (tx, amount) => {
    if (!(await confirmDialog(t('aw.approveConfirm', { amount: money(amount ?? tx.amount), name: personName(tx.driver) })))) return;
    run(async () => {
      await api.post(`/admin/topups/${tx._id}/approve`, amount !== undefined ? { amount } : {});
      toast.success(t('aw.approved'));
      reload();
    });
  };
  const approveOther = async (tx) => {
    const value = await promptDialog(t('aw.otherAmountPrompt'), String(tx.amount));
    if (value === null || !Number(value)) return;
    approve(tx, Number(value));
  };
  const recheck = (tx) =>
    run(async () => {
      const { data: res } = await api.post(`/admin/topups/${tx._id}/recheck`);
      if (res.outcome === 'verified') toast.success(t('aw.approved'));
      else toast.info(`${t(`aw.v.${res.outcome}`)}${res.reason ? `: ${res.reason}` : ''}`);
      reload();
    });
  const reject = async (tx) => {
    const reason = await promptDialog(t('aw.rejectPrompt'));
    if (reason === null) return;
    run(async () => {
      await api.post(`/admin/topups/${tx._id}/reject`, { reason });
      toast.success(t('aw.rejected'));
      reload();
    });
  };

  return (
    <Async loading={loading} error={error} reload={reload}>
      {data?.topups?.length ? (
        <div className="stack">
          {data.topups.map((tx) => (
            <div key={tx._id} className="card stack stack--sm">
              <div className="row row--between">
                <strong>{personName(tx.driver)}</strong>
                <strong>{money(tx.amount)}</strong>
              </div>
              <div className="small muted">
                {t(`we.m.${tx.method}`)} · {tx.reference ? t('aw.ref', { ref: tx.reference }) : '—'} · {dateTime(tx.createdAt)}
              </div>
              <div className="small muted">{t('ap.wallet', { amount: money(tx.driver?.driverProfile?.walletBalance) })}</div>
              {tx.verification?.status && <VerificationInfo v={tx.verification} />}
              {tx.rejectionReason && <div className="small">{t('common.reason', { reason: tx.rejectionReason })}</div>}
              {tx.proofImage && (
                <a href={tx.proofImage} target="_blank" rel="noreferrer">
                  <img src={tx.proofImage} alt={t('aw.receipt')} className="id-photo" />
                </a>
              )}
              {status === 'pending' && (
                <div className="row row--wrap">
                  {['telebirr', 'cbe'].includes(tx.method) && (
                    <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => recheck(tx)}>
                      {t('aw.recheck')}
                    </button>
                  )}
                  <button className="btn btn--sm" disabled={busy} onClick={() => approve(tx)}>
                    {t('aw.approve')}
                  </button>
                  <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => approveOther(tx)}>
                    {t('aw.otherAmount')}
                  </button>
                  <button className="btn btn--danger btn--sm" disabled={busy} onClick={() => reject(tx)}>
                    {t('aw.reject')}
                  </button>
                  {tx.driver?.phone && (
                    <button className="btn btn--ghost btn--sm" onClick={() => callPhone(tx.driver.phone, { username: tx.driver.username, name: personName(tx.driver) })}>
                      {t('common.call')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="💰" text={status === 'pending' ? t('aw.noTopups') : t('common.nothingHere')} />
      )}
    </Async>
  );
}

function Ledger({ driver, onClose }) {
  const t = useT();
  const { data, loading, error, reload } = useApi(`/admin/wallets/${driver._id}`);
  return (
    <Sheet open title={`${t('aw.history')} – ${personName(driver)}`} onClose={onClose}>
      <Async loading={loading} error={error} reload={reload}>
        <div className="stack stack--sm">
          {data?.transactions?.map((tx) => <TxRow key={tx._id} tx={tx} />)}
          {!data?.transactions?.length && <p className="muted small">{t('we.noHistory')}</p>}
        </div>
      </Async>
    </Sheet>
  );
}

function Balances() {
  const t = useT();
  const { data, loading, error, reload } = useApi('/admin/wallets');
  const [ledger, setLedger] = useState(null);
  const [busy, run] = useAction();

  const adjust = async (d) => {
    const amount = await promptDialog(t('aw.adjustAmount'));
    if (amount === null || !Number(amount)) return;
    const note = await promptDialog(t('aw.adjustNote'));
    if (!note) return;
    run(async () => {
      await api.post(`/admin/wallets/${d._id}/adjust`, { amount: Number(amount), note });
      toast.success(t('aw.adjusted'));
      reload();
    });
  };

  return (
    <Async loading={loading} error={error} reload={reload}>
      {data && (
        <div className="stack">
          <StatGrid
            items={[
              { label: t('aw.held'), value: money(data.prepaidHeld) },
              { label: t('aw.earned'), value: money(data.platformEarnedAllTime) },
            ]}
          />
          {data.drivers.length ? (
            data.drivers.map((d) => {
              const bal = d.driverProfile?.walletBalance || 0;
              return (
                <div key={d._id} className={`card stack stack--sm ${bal < 0 ? 'card--warn' : ''}`}>
                  <div className="row row--between">
                    <strong>
                      {personName(d)} {d.gender === 'female' ? '♀' : ''}
                    </strong>
                    <strong className={bal < 0 ? 'neg' : ''}>
                      {money(bal)} {bal < 0 && <span className="small">({t('aw.owes')})</span>}
                    </strong>
                  </div>
                  <div className="row row--wrap">
                    <button className="btn btn--secondary btn--sm" onClick={() => setLedger(d)}>
                      {t('aw.history')}
                    </button>
                    <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => adjust(d)}>
                      {t('aw.adjust')}
                    </button>
                    {d.phone && (
                      <button className="btn btn--ghost btn--sm" onClick={() => callPhone(d.phone, { username: d.username, name: personName(d) })}>
                        {t('common.call')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <Empty icon="🛵" text={t('aw.noDrivers')} />
          )}
          {ledger && <Ledger driver={ledger} onClose={() => setLedger(null)} />}
        </div>
      )}
    </Async>
  );
}

export default function AdminMoney() {
  const t = useT();
  const [tab, setTab] = useState('pending');
  return (
    <div className="page stack">
      <h2>{t('aw.title')}</h2>
      <p className="muted small">{t('aw.intro2')}</p>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'pending', label: t('aw.tabTopups') },
          { value: 'balances', label: t('aw.tabWallets') },
          { value: 'approved', label: t('aw.tabHistory') },
        ]}
      />
      {tab === 'balances' ? <Balances /> : <TopUps key={tab} status={tab} />}
    </div>
  );
}
