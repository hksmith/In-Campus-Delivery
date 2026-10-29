import { useT } from '../i18n/index.js';
import { Field } from './ui.jsx';

/**
 * Typed delivery place (no list, no area – the fee comes from the cafe's area):
 *   dorm  → block number + room number + male/female dorm
 *   place → "where exactly" text (+ optional details)
 * value: { kind, block, room, gender, text, details }
 */
export const emptyPlace = (kind = 'dorm', gender = '') => ({ kind, block: '', room: '', gender, text: '', details: '' });

/** A student's saved dorm (user.savedPlace) as the form value */
export const fromSaved = (sp, gender) =>
  sp?.kind === 'dorm' ? { ...emptyPlace('dorm', gender || ''), block: sp.block || '', room: sp.room || '' } : null;

export const isPlaceReady = (p) =>
  Boolean(
    p &&
      (p.kind === 'dorm'
        ? String(p.block).trim() && String(p.room).trim() && ['male', 'female'].includes(p.gender)
        : String(p.text || '').trim().length >= 3)
  );

/** "Block 12, Room 305" */
export const dormLabel = (t, sp) => t('place.dormLabel', { block: sp.block, room: sp.room });

export function KindSwitch({ value, onChange, dormLabel: dLabel, placeLabel }) {
  const t = useT();
  return (
    <div className="row">
      {[
        ['dorm', dLabel || t('place.kindDorm')],
        ['place', placeLabel || t('place.kindPlace')],
      ].map(([k, label]) => (
        <button
          type="button"
          key={k}
          className={`chip btn--grow ${value === k ? 'chip--active' : ''}`}
          onClick={() => onChange(k)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function PlaceFields({ value, onChange }) {
  const t = useT();
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });

  if (value.kind === 'dorm') {
    return (
      <div className="stack">
        <div className="row">
          <Field label={t('place.block')}>
            <input
              className="input"
              value={value.block}
              onChange={set('block')}
              inputMode="numeric"
              maxLength={20}
              placeholder="12"
              required
            />
          </Field>
          <Field label={t('place.room')}>
            <input
              className="input"
              value={value.room}
              onChange={set('room')}
              inputMode="numeric"
              maxLength={20}
              placeholder="305"
              required
            />
          </Field>
        </div>
        <Field label={t('place.dormGender')} hint={t('place.dormGenderHint')}>
          <div className="row">
            {['male', 'female'].map((g) => (
              <button
                type="button"
                key={g}
                className={`chip btn--grow ${value.gender === g ? 'chip--active' : ''}`}
                onClick={() => onChange({ ...value, gender: g })}
              >
                {t(g === 'male' ? 'place.maleDorm' : 'place.femaleDorm')}
              </button>
            ))}
          </div>
        </Field>
      </div>
    );
  }

  return (
    <div className="stack">
      <Field label={t('place.where')} hint={t('place.whereHint')}>
        <input
          className="input"
          value={value.text}
          onChange={set('text')}
          maxLength={80}
          placeholder={t('place.wherePh')}
          required
        />
      </Field>
      <Field label={t('place.details')}>
        <input
          className="input"
          value={value.details}
          onChange={set('details')}
          maxLength={120}
          placeholder={t('place.detailsPh')}
        />
      </Field>
    </div>
  );
}
