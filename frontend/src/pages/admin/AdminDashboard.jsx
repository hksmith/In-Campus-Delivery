import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { STATUS } from '../../lib/constants.js';
import { useSocketEvent } from '../../lib/socket.js';
import { useT } from '../../i18n/index.js';
import { Async, StatGrid } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

/** "Needs your review": one row per kind of thing waiting for the admin, each opening the right page */
function ReviewList({ data }) {
  const t = useT();
  const rows = [
    { n: data.pendingDrivers, icon: 'bike', label: t('rv.drivers'), where: t('rv.driversWhere'), to: '/admin/people?tab=drivers' },
    { n: data.pendingCafes, icon: 'menu', label: t('rv.cafes'), where: t('rv.cafesWhere'), to: '/admin/people?tab=cafes' },
    { n: data.pendingTopUps, icon: 'wallet', label: t('rv.topups'), where: t('rv.topupsWhere'), to: '/admin/money' },
    { n: data.openIssues, icon: 'alert', label: t('rv.issues'), where: t('rv.issuesWhere'), to: '/admin/orders?issues=1', bad: true },
  ].filter((r) => r.n > 0);
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + r.n, 0);

  return (
    <section className="review-list">
      <div className="review-list__head">
        <h3>{t('rv.title')}</h3>
        <span className="count-pill">{total}</span>
      </div>
      {rows.map((r) => (
        <Link key={r.to} to={r.to} className="review-list__row">
          <span className={`review-list__icon ${r.bad ? 'review-list__icon--bad' : ''}`}>
            <Icon name={r.icon} size={19} />
          </span>
          <span className="review-list__text">
            <strong>{r.label}</strong>
            <span className="muted small">{r.where}</span>
          </span>
          <span className={`count-pill ${r.bad ? 'count-pill--bad' : ''}`}>{r.n}</span>
        </Link>
      ))}
    </section>
  );
}

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
            <ReviewList data={data} />
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
