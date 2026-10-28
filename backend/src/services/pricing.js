import { round2 } from '../utils/helpers.js';

/**
 * Fee rules set by the admin. Each rule is { type: 'percent' | 'fixed', value }.
 *   percent → value % of the base amount
 *   fixed   → value birr per order (never more than the base amount)
 */
export function applyRule(rule, base) {
  if (!rule || !(Number(rule.value) > 0) || !(base > 0)) return 0;
  const cut = rule.type === 'fixed' ? Number(rule.value) : (base * Number(rule.value)) / 100;
  return round2(Math.min(base, Math.max(0, cut)));
}

/** The commission rule for a cafe: its own rule if the admin set one, otherwise the platform default */
export function commissionRuleFor(cafe, settings) {
  if (cafe?.commission?.type && cafe.commission.value != null) return { ...cafe.commission, custom: true };
  return { type: settings.commissionType || 'percent', value: settings.commissionValue ?? 10, custom: false };
}

export const deliveryRule = (settings) => ({
  type: settings.deliveryCutType || 'percent',
  value: settings.deliveryCutValue ?? 20,
});

/** Splits one order's money between cafe, driver and platform */
export function priceOrder({ subtotal, deliveryFee, cafe, settings }) {
  const commission = applyRule(commissionRuleFor(cafe, settings), subtotal);
  const platformDelivery = applyRule(deliveryRule(settings), deliveryFee);
  const driverEarning = round2(deliveryFee - platformDelivery);
  return {
    commission,
    driverEarning,
    platformEarning: round2(commission + platformDelivery),
    cafePayout: round2(subtotal - commission),
    total: round2(subtotal + deliveryFee),
  };
}

export function validateRule(rule, label) {
  if (!rule) return null;
  const type = rule.type === 'fixed' ? 'fixed' : rule.type === 'percent' ? 'percent' : null;
  const value = Number(rule.value);
  if (!type) return `${label}: choose percent or fixed amount`;
  if (!Number.isFinite(value) || value < 0) return `${label}: enter a number of 0 or more`;
  if (type === 'percent' && value > 100) return `${label}: a percentage can't be more than 100`;
  return null;
}
