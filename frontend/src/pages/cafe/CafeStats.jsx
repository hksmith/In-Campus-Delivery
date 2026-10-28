import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { dateTime, money } from '../../lib/format.js';
import { promptDialog } from '../../lib/telegram.js';
import { useT } from '../../i18n/index.js';
import { Async, Empty, Rating, Stars, StatGrid, Tabs } from '../../components/ui.jsx';

function Reviews() {
  const t = useT();
  const { data, loading, error, reload } = useApi('/my-cafe/reviews');
  const [, run] = useAction();
  const reply = async (review) => {
    const text = await promptDialog(t('cs.yourReply'), review.reply || '');
    if (text === null) return;
    run(async () => {
      await api.post(`/my-cafe/reviews/${review._id}/reply`, { reply: text });
      reload();
    });
  };
  return (
    <Async loading={loading} error={error} reload={reload}>
      {data?.reviews?.length ? (
        <div className="stack">
          {data.reviews.map((r) => (
            <div key={r._id} className="card stack stack--sm">
              <div className="row row--between">
                <Stars value={r.cafeRating} size="sm" />
                <span className="muted small">{dateTime(r.createdAt)}</span>
              </div>
              {r.comment && (
                <p>
                  “{r.comment}” <span className="muted small">– {r.customer?.firstName}</span>
                </p>
              )}
              {r.reply && <p className="small">↪️ {r.reply}</p>}
              <button className="link small" onClick={() => reply(r)}>
                {r.reply ? t('cs.editReply') : t('cs.reply')}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="⭐" text={t('cs.noReviews')} />
      )}
    </Async>
  );
}

export default function CafeStats() {
  const t = useT();
  const [tab, setTab] = useState('sales');
  const { data, loading, error, reload } = useApi(tab === 'sales' ? '/my-cafe/stats' : null);

  return (
    <div className="page stack">
      <h2>{t('cs.title')}</h2>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'sales', label: t('cs.sales') },
          { value: 'reviews', label: t('cs.reviews') },
        ]}
      />
      {tab === 'reviews' ? (
        <Reviews />
      ) : (
        <Async loading={loading} error={error} reload={reload}>
          {data && (
            <>
              <StatGrid
                items={[
                  { label: t('cs.ordersToday'), value: data.today.orders },
                  { label: t('cs.salesToday'), value: money(data.today.sales) },
                  { label: t('cs.activeNow'), value: data.activeOrders },
                  { label: t('cs.rating'), value: <Rating value={data.rating} count={data.ratingCount} /> },
                ]}
              />
              <div className="card">
                <h3>{t('cs.summary')}</h3>
                {[
                  [t('cs.last7'), data.week],
                  [t('cs.last30'), data.month],
                ].map(([label, s]) => (
                  <div key={label} className="sum-row">
                    <span>
                      {label} <span className="muted small">{t('cs.ordersN', { n: s.orders })}</span>
                    </span>
                    <span>{money(s.sales)}</span>
                  </div>
                ))}
                <div className="sum-row muted small">
                  <span>{t('cs.commission30')}</span>
                  <span>−{money(data.month.commission)}</span>
                </div>
                <div className="sum-row sum-row--total">
                  <span>{t('cs.received30')}</span>
                  <span>{money(data.month.net)}</span>
                </div>
              </div>
              <div className="card">
                <h3>{t('cs.topItems')}</h3>
                {data.topItems.length ? (
                  data.topItems.map((it) => (
                    <div key={it.name} className="sum-row">
                      <span>
                        {it.name} <span className="muted small">×{it.quantity}</span>
                      </span>
                      <span>{money(it.revenue)}</span>
                    </div>
                  ))
                ) : (
                  <p className="muted small">{t('cs.noSales')}</p>
                )}
              </div>
              {data.cancelledToday > 0 && <p className="muted small">{t('cs.cancelledToday', { n: data.cancelledToday })}</p>}
            </>
          )}
        </Async>
      )}
    </div>
  );
}
