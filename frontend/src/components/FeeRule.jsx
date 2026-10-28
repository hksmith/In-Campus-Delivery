import { money } from '../lib/format.js';
import { t as translate, useT } from '../i18n/index.js';

/** Same maths as backend/src/services/pricing.js */
export function applyRule(rule, base) {
  const v = Number(rule?.value);
  if (!(v > 0) || !(base > 0)) return 0;
  const cut = rule.type === 'fixed' ? v : (base * v) / 100;
  return Math.round(Math.min(base, Math.max(0, cut)) * 100) / 100;
}

/** "10%" or "15 ETB per order" */
export function ruleText(rule) {
  if (!rule) return '';
  return rule.type === 'fixed' ? translate('fee.perOrder', { amount: money(rule.value) }) : `${Number(rule.value)}%`;
}

/** Percent / fixed-birr switch + value input */
export default function FeeRuleInput({ value, onChange }) {
  const t = useT();
  const rule = value || { type: 'percent', value: 0 };
  return (
    <div className="row">
      <div className="lang-switch">
        {['percent', 'fixed'].map((type) => (
          <button
            type="button"
            key={type}
            className={rule.type === type ? 'active' : ''}
            onClick={() => onChange({ ...rule, type })}
          >
            {type === 'percent' ? '%' : t('fee.birr')}
          </button>
        ))}
      </div>
      <input
        className="input"
        type="number"
        min="0"
        max={rule.type === 'percent' ? 100 : undefined}
        step="0.5"
        value={rule.value}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
        required
      />
    </div>
  );
}
