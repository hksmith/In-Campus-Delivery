import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { useBackButton } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/index.js';
import { Async, Field, Toggle } from '../../components/ui.jsx';
import FeeRuleInput, { applyRule } from '../../components/FeeRule.jsx';

/** Live example so the admin sees what the fee rules mean in birr */
function MoneyExample({ form }) {
  const t = useT();
  const food = 200;
  const fee = 15;
  const commission = applyRule(form.commission, food);
  const cut = applyRule(form.deliveryCut, fee);
  return (
    <div className="banner banner--info small stack stack--sm">
      <strong>{t('as.ex.title', { food: money(food), fee: money(fee), total: money(food + fee) })}</strong>
      <span>{t('as.ex.cafe', { amount: money(food - commission) })}</span>
      <span>{t('as.ex.driver', { amount: money(fee - cut) })}</span>
      <span>{t('as.ex.you', { amount: money(commission + cut) })}</span>
    </div>
  );
}

export default function AdminSettings() {
  const t = useT();
  const navigate = useNavigate();
  const back = useCallback(() => navigate('/admin/more'), [navigate]);
  useBackButton(back);

  const { refresh } = useAuth();
  const { data, loading, error, reload } = useApi('/admin/settings');
  const [form, setForm] = useState(null);
  const [busy, run] = useAction();

  useEffect(() => {
    if (data?.settings) {
      const st = data.settings;
      setForm({
        ...st,
        commission: { type: st.commissionType || 'percent', value: st.commissionValue ?? 10 },
        deliveryCut: { type: st.deliveryCutType || 'percent', value: st.deliveryCutValue ?? 20 },
      });
    }
  }, [data]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      await api.patch('/admin/settings', {
        commissionType: form.commission.type,
        commissionValue: Number(form.commission.value) || 0,
        deliveryCutType: form.deliveryCut.type,
        deliveryCutValue: Number(form.deliveryCut.value) || 0,
        driverCreditLimit: Number(form.driverCreditLimit) || 0,
        minTopUp: Number(form.minTopUp) || 0,
        lowBalanceAlert: Number(form.lowBalanceAlert) || 0,
        paymentInstructions: form.paymentInstructions,
        isPlatformOpen: form.isPlatformOpen,
        closedMessage: form.closedMessage,
        announcement: form.announcement,
      });
      await refresh();
      toast.success(t('as.saved'));
    });
  };

  return (
    <div className="page stack">
      <h2>{t('as.title')}</h2>
      <Async loading={loading} error={error} reload={reload}>
        {form && (
          <form className="stack" onSubmit={save}>
            <div className="card stack">
              <Toggle label={t('as.open')} checked={form.isPlatformOpen} onChange={(v) => setForm((f) => ({ ...f, isPlatformOpen: v }))} />
              <Field label={t('as.closedMsg')}>
                <input className="input" value={form.closedMessage} onChange={set('closedMessage')} />
              </Field>
              <Field label={t('as.announcement')} hint={t('as.announcementHint')}>
                <textarea className="input" rows={2} value={form.announcement} onChange={set('announcement')} />
              </Field>
            </div>

            <div className="card stack">
              <h3>{t('as.feesTitle')}</h3>
              <Field label={t('as.commission')} hint={t('as.commissionHint')}>
                <FeeRuleInput value={form.commission} onChange={(commission) => setForm((f) => ({ ...f, commission }))} />
              </Field>
              <Field label={t('as.deliveryCut')} hint={t('as.deliveryCutHint')}>
                <FeeRuleInput value={form.deliveryCut} onChange={(deliveryCut) => setForm((f) => ({ ...f, deliveryCut }))} />
              </Field>
              <p className="muted small">{t('as.feeNote')}</p>
              <MoneyExample form={form} />
            </div>

            <div className="card stack">
              <h3>{t('as.walletTitle')}</h3>
              <p className="muted small">{t('as.autoNote')}</p>
              <Field label={t('as.instructions')} hint={t('as.instructionsHint')}>
                <textarea className="input" rows={3} value={form.paymentInstructions} onChange={set('paymentInstructions')} />
              </Field>
              <Field label={t('as.minTopUp')}>
                <input className="input" type="number" min="0" value={form.minTopUp} onChange={set('minTopUp')} />
              </Field>
              <Field label={t('as.lowAlert')} hint={t('as.lowAlertHint')}>
                <input className="input" type="number" min="0" value={form.lowBalanceAlert ?? 10} onChange={set('lowBalanceAlert')} />
              </Field>
              <Field label={t('as.credit')} hint={t('as.creditHint')}>
                <input className="input" type="number" min="0" value={form.driverCreditLimit} onChange={set('driverCreditLimit')} />
              </Field>
            </div>

            <p className="muted small">{t('as.note')}</p>
            <button className="btn btn--block" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </form>
        )}
      </Async>
    </div>
  );
}
