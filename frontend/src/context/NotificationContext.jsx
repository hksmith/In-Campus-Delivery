import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { money } from '../lib/format.js';
import { useSocketEvent } from '../lib/socket.js';
import { haptic } from '../lib/telegram.js';
import { beep } from '../lib/sound.js';
import { t } from '../i18n/index.js';
import { useAuth } from './AuthContext.jsx';

/**
 * In-app notifications:
 *  - counts: the numbers on the bottom tabs and inner tabs (from GET /notifications/counts)
 *  - banners: the dark message that slides down when something new happens
 */
const NotificationContext = createContext({ counts: {}, banners: [], dismiss: () => {}, refreshCounts: () => {} });

const BANNER_MS = 6000;
const OFFLINE_REMINDER_MS = 10 * 60000; // offline drivers: at most one "you're missing deliveries" banner per 10 min

/** Status changes a student hears about, and how each banner looks */
const CUSTOMER_EVENTS = {
  accepted: { icon: 'receipt', tone: 'ok', key: 'nt.cust.accepted' },
  rejected: { icon: 'receipt', tone: 'bad', key: 'nt.cust.rejected' },
  ready: { icon: 'box', tone: 'ok', key: 'nt.cust.ready' },
  claimed: { icon: 'bike', tone: 'ok', key: 'nt.cust.claimed' },
  assigned: { icon: 'bike', tone: 'ok', key: 'nt.cust.claimed' },
  picked_up: { icon: 'bike', tone: 'ok', key: 'nt.cust.pickedUp' },
  delivered: { icon: 'star', tone: 'ok', key: 'nt.cust.delivered' },
  cancelled: { icon: 'receipt', tone: 'bad', key: 'nt.cust.cancelled' },
};

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [counts, setCounts] = useState({});
  const [banners, setBanners] = useState([]);
  const nextId = useRef(0);
  const timer = useRef(null);
  const lastOfflineReminder = useRef(0);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const userId = user?._id;
  const role = user?.role;

  const loadCounts = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await api.get('/notifications/counts');
      setCounts(data.counts || {});
    } catch {
      /* keep the old numbers */
    }
  }, [userId]);

  /** Many events can arrive at once – refresh the numbers once, a moment later */
  const refreshCounts = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(loadCounts, 400);
  }, [loadCounts]);

  // On login / role change, and whenever the person moves to another page (things may have been handled)
  useEffect(() => {
    loadCounts();
  }, [loadCounts, role]);
  useEffect(() => {
    refreshCounts();
  }, [pathname, refreshCounts]);
  // Safety net in case a realtime event was missed
  useEffect(() => {
    if (!userId) return undefined;
    const id = setInterval(loadCounts, 60000);
    return () => clearInterval(id);
  }, [userId, loadCounts]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const dismiss = useCallback((id) => setBanners((list) => list.filter((b) => b.id !== id)), []);

  const show = useCallback(
    (banner, { sound = false } = {}) => {
      const id = ++nextId.current;
      // Newest on top, at most 2 on screen
      setBanners((list) => [{ ...banner, id }, ...list].slice(0, 2));
      setTimeout(() => dismiss(id), BANNER_MS);
      haptic.warning();
      if (sound) beep();
    },
    [dismiss]
  );

  // ── Realtime events → numbers + banners ──
  useSocketEvent('socket:connected', refreshCounts);
  useSocketEvent('me:updated', refreshCounts);
  useSocketEvent('order:updated', refreshCounts);
  useSocketEvent('pool:changed', refreshCounts);

  // Driver: a new delivery is waiting
  useSocketEvent('pool:new', (p) => {
    refreshCounts();
    if (role !== 'driver') return;
    const g = p?.driverGender;
    if (g && g !== 'any' && user?.gender && g !== user.gender) return; // not allowed to take this one
    if (user?.driverProfile?.isOnline) {
      show(
        {
          icon: 'bike',
          title: t('nt.drv.newTitle'),
          text: t('nt.drv.newText', { cafe: p?.cafeName || '', place: p?.place || '', earn: money(p?.earn) }),
          to: '/driver',
          action: t('nt.view'),
        },
        { sound: true }
      );
    } else if (Date.now() - lastOfflineReminder.current > OFFLINE_REMINDER_MS) {
      lastOfflineReminder.current = Date.now();
      show({ icon: 'box', tone: 'warn', title: t('nt.drv.offTitle'), text: t('nt.drv.offText'), to: '/driver', action: t('nt.goOnline') });
    }
  });

  // Cafe: a new order came in
  useSocketEvent('order:new', (p) => {
    refreshCounts();
    show(
      {
        icon: 'receipt',
        title: t('nt.cafe.newTitle', { n: p?.orderNumber ?? '' }),
        text: t('nt.cafe.newText', { items: p?.itemCount ?? '', total: money(p?.subtotal) }),
        to: '/cafe/orders',
        action: t('nt.view'),
      },
      { sound: true }
    );
  });

  // Admin: something to review
  useSocketEvent('admin:applications', (p) => {
    refreshCounts();
    if (!p?.kind) return;
    const isDriver = p.kind === 'driver';
    show({
      icon: isDriver ? 'bike' : 'menu',
      title: t(isDriver ? 'nt.adm.driverTitle' : 'nt.adm.cafeTitle'),
      text: t(isDriver ? 'nt.adm.driverText' : 'nt.adm.cafeText', { name: p.name || '' }),
      to: `/admin/people?tab=${isDriver ? 'drivers' : 'cafes'}`,
      action: t('nt.review'),
    });
  });
  useSocketEvent('admin:topups', (p) => {
    refreshCounts();
    if (!p?.isNew) return;
    show({
      icon: 'wallet',
      title: t('nt.adm.topupTitle'),
      text: t('nt.adm.topupText', { name: p.name || '', amount: money(p.amount) }),
      to: '/admin/money',
      action: t('nt.review'),
    });
  });
  useSocketEvent('order:updated', (p) => {
    if (role === 'admin' && p?.event === 'pickup_issue') {
      show({
        icon: 'alert',
        tone: 'bad',
        title: t('nt.adm.issueTitle'),
        text: t('nt.adm.issueText', { n: p.orderNumber }),
        to: '/admin/orders?issues=1',
        action: t('nt.review'),
      });
    }
  });

  // Student: their own order moved on
  useSocketEvent('myorder:updated', (p) => {
    const look = CUSTOMER_EVENTS[p?.event];
    if (!look) return;
    if (p.event === 'cancelled' && p.cancelledBy === 'customer') return; // they did it themselves
    const to = `/orders/${p.orderId}`;
    if (pathRef.current === to) return; // already looking at it
    show({
      icon: look.icon,
      tone: look.tone,
      title: t(`${look.key}Title`),
      text: t(`${look.key}Text`, { n: p.orderNumber, cafe: p.cafeName || '' }),
      to,
      action: t('nt.view'),
    });
  });

  const value = useMemo(() => ({ counts, banners, dismiss, refreshCounts }), [counts, banners, dismiss, refreshCounts]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export const useNotifications = () => useContext(NotificationContext);
