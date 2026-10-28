import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { dateTime, money } from '../../lib/format.js';
import { useSocketEvent } from '../../lib/socket.js';
import { useT } from '../../i18n/index.js';
import { Async, Empty, StatusBadge, Tabs } from '../../components/ui.jsx';

export default function Orders() {
  const t = useT();
  const [scope, setScope] = useState('active');
  const { data, loading, error, reload } = useApi('/orders', { params: { scope } });
  useSocketEvent('order:updated', () => reload());

  return (
    <div className="page stack">
      <h2>{t('orders.title')}</h2>
      <Tabs
        value={scope}
        onChange={setScope}
        tabs={[
          { value: 'active', label: t('orders.active') },
          { value: 'past', label: t('orders.past') },
        ]}
      />
      <Async loading={loading} error={error} reload={reload}>
        {data?.orders?.length ? (
          <div className="stack">
            {data.orders.map((o) => (
              <Link key={o._id} to={`/orders/${o._id}`} className="order-row">
                <div>
                  <strong>{o.cafe?.name}</strong>
                  <div className="muted small">
                    #{o.orderNumber} · {dateTime(o.createdAt)} · {t('common.items', { n: o.items.reduce((s, i) => s + i.quantity, 0) })}
                  </div>
                </div>
                <div className="order-row__right">
                  <StatusBadge status={o.status} />
                  <span className="small">{money(o.total)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty icon="🧾" text={scope === 'active' ? t('orders.noActive') : t('orders.noPast')} />
        )}
      </Async>
    </div>
  );
}
