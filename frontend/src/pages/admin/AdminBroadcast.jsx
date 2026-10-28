import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAction } from '../../lib/hooks.js';
import { confirmDialog, useBackButton } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useT } from '../../i18n/index.js';
import { Field } from '../../components/ui.jsx';

export default function AdminBroadcast() {
  const t = useT();
  const navigate = useNavigate();
  const back = useCallback(() => navigate('/admin/more'), [navigate]);
  useBackButton(back);

  const [audience, setAudience] = useState('all');
  const [message, setMessage] = useState('');
  const [busy, run] = useAction();

  const send = async (e) => {
    e.preventDefault();
    if (!(await confirmDialog(t('ab.confirm')))) return;
    run(async () => {
      const { data } = await api.post('/admin/broadcast', { audience, message });
      toast.success(t('ab.sent', { n: data.queued }));
      setMessage('');
    });
  };

  return (
    <div className="page stack">
      <h2>{t('ab.title')}</h2>
      <form className="card stack" onSubmit={send}>
        <Field label={t('ab.sendTo')}>
          <select className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">{t('ab.everyone')}</option>
            <option value="customers">{t('ab.students')}</option>
            <option value="drivers">{t('ab.drivers')}</option>
            <option value="cafes">{t('ab.cafes')}</option>
          </select>
        </Field>
        <Field label={t('ab.message')} hint={t('ab.messageHint')}>
          <textarea
            className="input"
            rows={5}
            maxLength={3500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('ab.placeholder')}
          />
        </Field>
        <button className="btn btn--block" disabled={busy || message.trim().length < 2}>
          {t('common.send')}
        </button>
      </form>
    </div>
  );
}
