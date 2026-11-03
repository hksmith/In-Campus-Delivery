import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api.js';
import { dateTime } from '../../lib/format.js';
import { toast } from '../../lib/toast.js';
import { useT } from '../../i18n/index.js';
import { Async, Empty, Stars } from '../../components/ui.jsx';

/** Big average + how many 5★, 4★ … ratings */
function Summary({ rating, count, breakdown }) {
  const t = useT();
  const max = Math.max(1, ...Object.values(breakdown || {}));
  return (
    <div className="card rating-summary">
      <div className="rating-summary__score">
        <span className="muted small">{t('dr.average')}</span>
        <strong className="rating-summary__value">{Number(rating || 0).toFixed(1)}</strong>
        <Stars value={Math.round(rating || 0)} size="sm" />
        <span className="muted small">{t('dr.basedOn', { n: count })}</span>
      </div>
      <div className="rating-summary__bars">
        {[5, 4, 3, 2, 1].map((star) => {
          const n = breakdown?.[star] || 0;
          return (
            <div key={star} className="rating-bar">
              <span className="small">{star}★</span>
              <span className="rating-bar__track">
                <span className="rating-bar__fill" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="muted small rating-bar__n">{n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Average, star breakdown and the latest reviews. Shown as the "Ratings" tab in My trips. */
export default function DriverRatings() {
  const t = useT();
  const [summary, setSummary] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (p = 1) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const { data } = await api.get('/driver/reviews', { params: { page: p } });
      if (p === 1) {
        setSummary({ rating: data.rating, count: data.ratingCount, breakdown: data.breakdown });
        setReviews(data.reviews);
      } else {
        setReviews((prev) => [...prev, ...data.reviews]);
      }
      setHasMore(Boolean(data.hasMore));
      setPage(p);
    } catch (err) {
      if (p === 1) setError(errorMessage(err));
      else toast.error(errorMessage(err));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <>
      <Async loading={loading} error={error} reload={() => load(1)}>
        {summary?.count ? (
          <div className="stack">
            <Summary rating={summary.rating} count={summary.count} breakdown={summary.breakdown} />
            {reviews.map((r) => (
              <div key={r._id} className="card stack stack--sm">
                <div className="row row--between">
                  <Stars value={r.rating} size="sm" />
                  <span className="muted small">{dateTime(r.createdAt)}</span>
                </div>
                {r.comment && (
                  <p>
                    “{r.comment}” <span className="muted small">– {r.customer?.firstName}</span>
                  </p>
                )}
                {r.orderNumber && <span className="muted small">{t('dr.order', { n: r.orderNumber })}</span>}
              </div>
            ))}
            {hasMore && (
              <button className="btn btn--secondary btn--block" disabled={loadingMore} onClick={() => load(page + 1)}>
                {loadingMore ? t('common.loading') : t('dh.loadMore')}
              </button>
            )}
            <p className="muted small">💡 {t('dr.tip')}</p>
          </div>
        ) : (
          <Empty icon="⭐" title={t('dr.none')} text={t('dr.noneText')} />
        )}
      </Async>
    </>
  );
}
