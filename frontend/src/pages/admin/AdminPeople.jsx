import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useApi, useAction } from '../../lib/hooks.js';
import { dateTime, money, personName } from '../../lib/format.js';
import { ROLES } from '../../lib/constants.js';
import { useSocketEvent } from '../../lib/socket.js';
import { callPhone, confirmDialog, openTelegramUser, promptDialog } from '../../lib/telegram.js';
import { toast } from '../../lib/toast.js';
import { useT } from '../../i18n/index.js';
import { Async, Empty, Rating, Sheet, Tabs } from '../../components/ui.jsx';
import FeeRuleInput, { ruleText } from '../../components/FeeRule.jsx';

const STATUS_FILTERS = ['pending', 'approved', 'suspended', 'rejected'];

function Contact({ user }) {
  if (!user) return null;
  return (
    <div className="row row--wrap small">
      {user.phone && (
        <button className="link" onClick={() => callPhone(user.phone)}>
          📞 {user.phone}
        </button>
      )}
      {user.username && (
        <button className="link" onClick={() => openTelegramUser(user.username)}>
          💬 @{user.username}
        </button>
      )}
    </div>
  );
}

function StatusChips({ value, onChange }) {
  const t = useT();
  return (
    <div className="chips-scroll">
      {STATUS_FILTERS.map((f) => (
        <button key={f} className={`chip ${value === f ? 'chip--active' : ''}`} onClick={() => onChange(f)}>
          {t(`ap.f.${f}`)}
        </button>
      ))}
    </div>
  );
}

function GenderButtons({ user, onDone }) {
  const t = useT();
  const [busy, run] = useAction();
  const set = (gender) =>
    run(async () => {
      await api.patch(`/admin/users/${user._id}`, { gender });
      onDone();
    });
  return (
    <div className="row small">
      <span className="muted">{t('common.gender')}:</span>
      {['female', 'male'].map((g) => (
        <button key={g} className={`chip ${user.gender === g ? 'chip--active' : ''}`} disabled={busy} onClick={() => set(g)}>
          {t(`common.${g}`)}
        </button>
      ))}
    </div>
  );
}

/** Admin sets a special commission for one cafe, or resets it to the platform default */
function CommissionSheet({ cafe, onClose, onDone }) {
  const t = useT();
  const [rule, setRule] = useState(cafe.commission || { type: 'percent', value: 10 });
  const [busy, run] = useAction();
  const save = (body) =>
    run(async () => {
      await api.patch(`/admin/cafes/${cafe._id}/commission`, body);
      toast.success(t('common.saved'));
      onDone();
      onClose();
    });
  return (
    <Sheet open title={t('ap.commissionTitle', { name: cafe.name })} onClose={onClose}>
      <p className="muted small">{t('ap.commissionHint')}</p>
      <FeeRuleInput value={rule} onChange={setRule} />
      <button className="btn btn--block" disabled={busy} onClick={() => save({ type: rule.type, value: Number(rule.value) })}>
        {t('common.save')}
      </button>
      {cafe.commission && (
        <button className="btn btn--ghost btn--block" disabled={busy} onClick={() => save({ reset: true })}>
          {t('ap.commissionReset')}
        </button>
      )}
    </Sheet>
  );
}

function Cafes() {
  const t = useT();
  const [status, setStatus] = useState('pending');
  const { data, loading, error, reload } = useApi('/admin/cafes', { params: { status } });
  const [busy, run] = useAction();
  const [editing, setEditing] = useState(null);
  useSocketEvent('admin:applications', () => reload());

  const setCafeStatus = async (cafe, next) => {
    let reason;
    if (next !== 'approved') {
      reason = await promptDialog(t('ap.reasonPrompt', { name: cafe.name }));
      if (reason === null) return;
    } else if (!(await confirmDialog(t('ap.approveCafe', { name: cafe.name })))) return;
    run(async () => {
      await api.patch(`/admin/cafes/${cafe._id}/status`, { status: next, reason });
      toast.success(t('ap.statusToast', { name: cafe.name, status: t(`ap.f.${next}`) }));
      reload();
    });
  };

  return (
    <div className="stack">
      <StatusChips value={status} onChange={setStatus} />
      <Async loading={loading} error={error} reload={reload}>
        {data?.cafes?.length ? (
          data.cafes.map((c) => (
            <div key={c._id} className="card stack stack--sm">
              <div className="row">
                {c.logo ? <img src={c.logo} alt="" className="avatar" /> : <div className="avatar">🏪</div>}
                <div>
                  <strong>{c.name}</strong>
                  <div className="muted small">
                    {c.campusSpot || t('ap.noLocation')} · {c.openingTime}–{c.closingTime}
                  </div>
                </div>
              </div>
              {c.description && <p className="small">{c.description}</p>}
              <div className="small muted">
                {t('ap.owner', { name: personName(c.owner), date: dateTime(c.createdAt) })}
                {c.status === 'approved' && (
                  <>
                    {' · '}
                    <Rating value={c.rating} count={c.ratingCount} /> · {t('ap.ordersN', { n: c.totalOrders })}
                  </>
                )}
              </div>
              <Contact user={c.owner} />
              <div className="row row--between small">
                <span>
                  {t('ap.commission')}:{' '}
                  <strong>{c.commission ? ruleText(c.commission) : t('ap.commissionDefault')}</strong>
                </span>
                <button className="link small" onClick={() => setEditing(c)}>
                  {t('common.change')}
                </button>
              </div>
              {c.rejectionReason && <div className="small">{t('common.reason', { reason: c.rejectionReason })}</div>}
              <div className="row row--wrap">
                {c.status !== 'approved' && (
                  <button className="btn btn--sm" disabled={busy} onClick={() => setCafeStatus(c, 'approved')}>
                    {c.status === 'suspended' ? t('ap.reactivate') : t('ap.approve')}
                  </button>
                )}
                {c.status === 'pending' && (
                  <button className="btn btn--danger btn--sm" disabled={busy} onClick={() => setCafeStatus(c, 'rejected')}>
                    {t('ap.reject')}
                  </button>
                )}
                {c.status === 'approved' && (
                  <button className="btn btn--danger btn--sm" disabled={busy} onClick={() => setCafeStatus(c, 'suspended')}>
                    {t('ap.suspend')}
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <Empty icon="🏪" text={t('common.nothingHere')} />
        )}
      </Async>
      {editing && <CommissionSheet cafe={editing} onClose={() => setEditing(null)} onDone={reload} />}
    </div>
  );
}

function Drivers() {
  const t = useT();
  const [status, setStatus] = useState('pending');
  const { data, loading, error, reload } = useApi('/admin/drivers', { params: { status } });
  const [busy, run] = useAction();
  useSocketEvent('admin:applications', () => reload());

  const setDriverStatus = async (d, next) => {
    let reason;
    if (next !== 'approved') {
      reason = await promptDialog(t('ap.reasonPrompt', { name: personName(d) }));
      if (reason === null) return;
    } else if (!(await confirmDialog(t('ap.approveDriver', { name: personName(d) })))) return;
    run(async () => {
      await api.patch(`/admin/drivers/${d._id}/status`, { status: next, reason });
      toast.success(t('ap.statusToast', { name: personName(d), status: t(`ap.f.${next}`) }));
      reload();
    });
  };

  return (
    <div className="stack">
      <StatusChips value={status} onChange={setStatus} />
      <Async loading={loading} error={error} reload={reload}>
        {data?.drivers?.length ? (
          data.drivers.map((d) => {
            const dp = d.driverProfile;
            return (
              <div key={d._id} className="card stack stack--sm">
                <div className="row row--between">
                  <strong>
                    {dp.status === 'approved' && (dp.isOnline ? '🟢 ' : '⚪ ')}
                    {personName(d)} {d.gender === 'female' ? '♀' : d.gender === 'male' ? '♂' : ''}
                  </strong>
                  {dp.status === 'approved' && <Rating value={dp.rating} count={dp.ratingCount} />}
                </div>
                <div className="small muted">
                  {t('ap.idLine', { id: dp.idNumber || '—', date: dateTime(dp.appliedAt) })}
                  {dp.status === 'approved' &&
                    ` · ${t('profile.deliveries', { n: dp.totalDeliveries })} · ${t('ap.wallet', { amount: money(dp.walletBalance) })}`}
                </div>
                <Contact user={d} />
                <GenderButtons user={d} onDone={reload} />
                {dp.idImage && (
                  <a href={dp.idImage} target="_blank" rel="noreferrer">
                    <img src={dp.idImage} alt="Student ID" className="id-photo" />
                  </a>
                )}
                {dp.rejectionReason && <div className="small">{t('common.reason', { reason: dp.rejectionReason })}</div>}
                <div className="row row--wrap">
                  {dp.status !== 'approved' && dp.status !== 'rejected' && (
                    <button className="btn btn--sm" disabled={busy} onClick={() => setDriverStatus(d, 'approved')}>
                      {dp.status === 'suspended' ? t('ap.reactivate') : t('ap.approve')}
                    </button>
                  )}
                  {dp.status === 'pending' && (
                    <button className="btn btn--danger btn--sm" disabled={busy} onClick={() => setDriverStatus(d, 'rejected')}>
                      {t('ap.reject')}
                    </button>
                  )}
                  {dp.status === 'approved' && (
                    <button className="btn btn--danger btn--sm" disabled={busy} onClick={() => setDriverStatus(d, 'suspended')}>
                      {t('ap.suspend')}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <Empty icon="🛵" text={t('common.nothingHere')} />
        )}
      </Async>
    </div>
  );
}

function Users() {
  const t = useT();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const { data, loading, error, reload } = useApi('/admin/users', {
    params: { ...(search.length >= 2 ? { search } : {}), ...(role ? { role } : {}) },
  });
  const [busy, run] = useAction();

  const toggleBan = async (u) => {
    let banReason;
    if (!u.isBanned) {
      banReason = await promptDialog(t('ap.banPrompt', { name: personName(u) }));
      if (banReason === null) return;
    }
    run(async () => {
      await api.patch(`/admin/users/${u._id}`, { isBanned: !u.isBanned, banReason });
      reload();
    });
  };
  const resetRole = async (u) => {
    if (!(await confirmDialog(t('ap.makeStudentConfirm', { name: personName(u) })))) return;
    run(async () => {
      await api.patch(`/admin/users/${u._id}`, { role: 'customer' });
      reload();
    });
  };

  return (
    <div className="stack">
      <input className="input" placeholder={t('ap.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="">{t('ap.allRoles')}</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {t(`role.${r}`)}
          </option>
        ))}
      </select>
      <Async loading={loading} error={error} reload={reload}>
        {data?.users?.map((u) => (
          <div key={u._id} className={`card stack stack--sm ${u.isBanned ? 'card--warn' : ''}`}>
            <div className="row row--between">
              <strong>{personName(u)}</strong>
              <span className="badge badge--info">{t(`role.${u.role}`)}</span>
            </div>
            <div className="small muted">
              {u.cafe?.name ? `🏪 ${u.cafe.name} · ` : ''}
              {u.studentId ? `ID ${u.studentId} · ` : ''}
              {t('ap.joined', { date: dateTime(u.createdAt) })}
              {u.botBlocked ? ` · ${t('ap.blockedBot')}` : ''}
            </div>
            <Contact user={u} />
            {u.isBanned && (
              <div className="small">
                {t('ap.banned')}
                {u.banReason ? `: ${u.banReason}` : ''}
              </div>
            )}
            {u.role !== 'admin' && (
              <div className="row row--wrap">
                <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => toggleBan(u)}>
                  {u.isBanned ? t('ap.unban') : t('ap.ban')}
                </button>
                {['driver', 'cafe_staff'].includes(u.role) && (
                  <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => resetRole(u)}>
                    {t('ap.makeStudent')}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {!data?.users?.length && <Empty icon="👥" text={t('ap.noUsers')} />}
      </Async>
    </div>
  );
}

export default function AdminPeople() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'cafes';
  return (
    <div className="page stack">
      <h2>{t('ap.title')}</h2>
      <Tabs
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        tabs={[
          { value: 'cafes', label: t('ap.cafes') },
          { value: 'drivers', label: t('ap.drivers') },
          { value: 'users', label: t('ap.users') },
        ]}
      />
      {tab === 'cafes' && <Cafes />}
      {tab === 'drivers' && <Drivers />}
      {tab === 'users' && <Users />}
    </div>
  );
}
