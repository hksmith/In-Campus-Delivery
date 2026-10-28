import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { STATUS } from '../../lib/constants.js';
import { useSocketEvent } from '../../lib/socket.js';
import { useT } from '../../i18n/index.js';
import { Async, StatGrid } from '../../components/ui.jsx';

export default function AdminDashboard() {
  const t = useT();
  const { data, loading, error, reload } = useApi('/admin/stats');
  useSocketEvent('order:updated', () => reload());
  useSocketEvent('admin:applications', () => reload());
  useSocketEvent('admin:topups', () => reload());

  return (
    <div className="page stack">
      <h2>{t('ad.title')}</h2>
      <Async loading={loading} error={error} reload={reload}>
        {data && (
          <>
            {data.pendingTopUps > 0 && (
              <Link to="/admin/money" className="banner banner--warn">
                {t('ad.topups', { n: data.pendingTopUps })}
              </Link>
            )}
            {data.openIssues > 0 && (
              <Link to="/admin/orders?issues=1" className="banner banner--bad">
                {t('ad.issues', { n: data.openIssues })}
              </Link>
            )}
            {(data.pendingCafes > 0 || data.pendingDrivers > 0) && (
              <Link to="/admin/people" className="banner banner--warn">
                {t('ad.waiting', { cafes: data.pendingCafes, drivers: data.pendingDrivers })}
              </Link>
            )}
            <StatGrid
              items={[
                { label: t('ad.active'), value: data.activeOrders },
                { label: t('ad.online'), value: data.onlineDrivers },
                { label: t('ad.deliveredToday'), value: data.today.orders },
                { label: t('ad.avg'), value: t('ad.avgMin', { n: data.today.avgDeliveryMinutes || data.week.avgDeliveryMinutes }) },
              ]}
            />
            <div className="card">
              <h3>{t('ad.money')}</h3>
              {[
                [t('ad.today'), data.today],
                [t('ad.last7'), data.week],
                [t('ad.last30'), data.month],
              ].map(([label, r]) => (
                <div className="sum-row" key={label}>
                  <span>
                    {label} <span className="muted small">{t('ad.ordersSales', { n: r.orders, amount: money(r.gmv) })}</span>
                  </span>
                  <strong>{money(r.platformEarning)}</strong>
                </div>
              ))}
              <p className="muted small">{t('ad.boldNote')}</p>
            </div>
            <div className="card">
              <h3>{t('ad.todaysOrders')}</h3>
              {Object.keys(data.todayByStatus).length === 0 && <p className="muted small">{t('ad.noOrdersToday')}</p>}
              {Object.entries(data.todayByStatus).map(([status, n]) => (
                <div className="sum-row" key={status}>
                  <span>
                    {STATUS[status]?.icon} {t(`status.${status}`)}
                  </span>
                  <span>{n}</span>
                </div>
              ))}
            </div>
            <div className="card">
              <h3>{t('ad.topCafes')}</h3>
              {data.topCafes.length === 0 && <p className="muted small">{t('ad.noData')}</p>}
              {data.topCafes.map((c) => (
                <div className="sum-row" key={c._id}>
                  <span>
                    {c.name} <span className="muted small">({c.orders})</span>
                  </span>
                  <span>{money(c.sales)}</span>
                </div>
              ))}
            </div>
            <div className="card">
              <h3>{t('ad.users')}</h3>
              {Object.entries(data.usersByRole).map(([role, n]) => (
                <div className="sum-row" key={role}>
                  <span>{t(`role.${role}`)}</span>
                  <span>{n}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
