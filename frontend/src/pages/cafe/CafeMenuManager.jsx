import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useT } from '../../i18n/index.js';
import { Async, Empty, Toggle } from '../../components/ui.jsx';

export default function CafeMenuManager() {
  const t = useT();
  const { user } = useAuth();
  const isOwner = user.role === 'cafe_owner';
  const { data, loading, error, reload, setData } = useApi('/my-cafe/menu');
  const [, run] = useAction();

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of data?.items || []) {
      const c = item.category || 'Other';
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(item);
    }
    return [...map.entries()];
  }, [data]);

  const setAvailable = (item, isAvailable) =>
    run(async () => {
      // optimistic update
      setData({ items: data.items.map((i) => (i._id === item._id ? { ...i, isAvailable } : i)) });
      try {
        await api.patch(`/my-cafe/menu/${item._id}/availability`, { isAvailable });
      } catch (err) {
        reload();
        throw err;
      }
    });

  return (
    <div className="page stack">
      <div className="row row--between">
        <h2>{t('cm.title')}</h2>
        {isOwner && (
          <Link to="/cafe/menu/new" className="btn btn--sm">
            {t('cm.addItem')}
          </Link>
        )}
      </div>
      <p className="muted small">{t('cm.hint')}</p>
      <Async loading={loading} error={error} reload={reload}>
        {groups.length === 0 ? (
          <Empty
            icon="📋"
            title={t('cm.emptyTitle')}
            text={isOwner ? t('cm.emptyOwner') : t('cm.emptyStaff')}
          />
        ) : (
          groups.map(([category, items]) => (
            <section key={category} className="stack stack--sm">
              <h3 className="section-title">{category}</h3>
              {items.map((item) => (
                <div key={item._id} className={`menu-admin ${item.isAvailable ? '' : 'menu-admin--off'}`}>
                  {item.image ? <img src={item.image} alt="" className="menu-admin__img" /> : <div className="menu-admin__img">🍽</div>}
                  <div className="menu-admin__body">
                    {isOwner ? (
                      <Link to={`/cafe/menu/${item._id}`}>
                        <strong>{item.name}</strong>
                      </Link>
                    ) : (
                      <strong>{item.name}</strong>
                    )}
                    <span className="muted small">
                      {money(item.price)}
                      {item.options?.length ? ` · ${t('cm.extras', { n: item.options.length })}` : ''}
                    </span>
                  </div>
                  <Toggle checked={item.isAvailable} onChange={(v) => setAvailable(item, v)} />
                </div>
              ))}
            </section>
          ))
        )}
      </Async>
    </div>
  );
}
