import type { ReactNode } from 'react';
import type { KnobRange } from '../../lib/customizeKnobs';
import { useIsPhone } from '../../hooks/useIsPhone';

interface SliderFieldProps {
  label: string;
  range: KnobRange;
  /** What the number box shows. Undefined means Auto (optional fields) or not yet set. */
  value: number | undefined;
  onChange: (value: number) => void;
  /** Where the slider rests, and the box's placeholder, while `value` is undefined. */
  autoValue?: number;
  /**
   * Offer an "Auto" chip that hands the number back to the geometry. Clearing
   * the box does the same. Without it, a cleared box keeps its last value
   * rather than storing NaN.
   */
  onAuto?: () => void;
  /** Lights the Auto chip. Defaults to `value === undefined`. */
  isAuto?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
}

const box = 'w-24 bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 text-right tabular-nums';
const phoneBox = 'w-24 h-11 bg-gray-700 text-white px-2 rounded border border-gray-600 text-right tabular-nums';
const phoneStep = 'w-11 h-11 shrink-0 rounded-lg border border-gray-600 bg-dcs-dark text-xl leading-none text-gray-200 active:bg-dcs-blue disabled:opacity-40';

/**
 * One step up or down from `from`, landing on the slider's own grid (counted
 * from `range.min`, as the slider counts). A value already off the grid goes
 * to the next grid point, not a whole step past it. Never leaves the slider's
 * range; a number outside it is typed in the box.
 */
function stepFrom(from: number, range: KnobRange, dir: 1 | -1): number {
  const k = (from - range.min) / range.step;
  const n = dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
  const decimals = (String(range.step).split('.')[1] ?? '').length;
  const next = Number((range.min + n * range.step).toFixed(decimals));
  return dir > 0 ? Math.min(next, Math.max(range.max, from)) : Math.max(next, Math.min(range.min, from));
}

/**
 * One Customize number: a slider to drag for a feel of it, and a box beside it
 * for an exact value. Both drive the same field, so the map redraws on every
 * tick of the slider and on every keystroke in the box.
 *
 * The slider's range is a convenience, not a limit. The box takes any finite
 * number, and a value past either end just pins the slider there. The tool
 * warns about questionable numbers elsewhere and never blocks them.
 *
 * On a phone a thumb is too blunt for a slider alone: it gets a bigger knob,
 * a − and + either side for one step at a time, and the box moves up beside
 * the label and opens the number pad.
 */
export function SliderField({ label, range, value, onChange, autoValue, onAuto, isAuto, disabled = false, hint }: SliderFieldProps) {
  const isPhone = useIsPhone();
  const auto = isAuto ?? value === undefined;
  const shown = value ?? autoValue;
  const current = shown != null && Number.isFinite(shown) ? shown : undefined;
  const sliderValue = current != null ? Math.min(Math.max(current, range.min), range.max) : range.min;

  const fromBox = (text: string) => {
    const v = parseFloat(text);
    if (Number.isFinite(v)) onChange(v);
    else if (text.trim() === '' && onAuto) onAuto();
  };

  const autoChip = (size: string) =>
    onAuto && (
      <button
        type="button"
        disabled={disabled}
        onClick={onAuto}
        className={`text-xs ${size} rounded border transition-colors ${
          auto ? 'bg-dcs-blue border-blue-400 text-white' : 'border-gray-600 text-gray-400 hover:text-white hover:border-gray-400'
        }`}
        title="Let the geometry set this number"
      >
        Auto
      </button>
    );

  const placeholder = autoValue != null && Number.isFinite(autoValue) ? String(Math.round(autoValue * 100) / 100) : undefined;

  if (isPhone) {
    const from = current ?? range.min;
    return (
      <div className={disabled ? 'opacity-50' : undefined}>
        <div className="flex items-center gap-2 mb-1">
          <label className="flex-1 min-w-0 text-sm font-medium leading-tight">{label}</label>
          {autoChip('h-11 px-3 shrink-0')}
          <input
            type="number"
            inputMode="decimal"
            step={range.step}
            value={value ?? ''}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => fromBox(e.target.value)}
            className={phoneBox}
            aria-label={label}
          />
          <span className="w-6 shrink-0 text-xs text-gray-400">{range.unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={phoneStep} disabled={disabled || from <= range.min} onClick={() => onChange(stepFrom(from, range, -1))} aria-label={`${label}: down one step`}>
            −
          </button>
          <input
            type="range"
            min={range.min}
            max={range.max}
            step={range.step}
            value={sliderValue}
            disabled={disabled}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className={`range-lg flex-1 min-w-0 ${auto ? 'opacity-60' : ''}`}
            aria-label={label}
          />
          <button type="button" className={phoneStep} disabled={disabled || from >= range.max} onClick={() => onChange(stepFrom(from, range, 1))} aria-label={`${label}: up one step`}>
            +
          </button>
        </div>
        {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
      </div>
    );
  }

  return (
    <div className={disabled ? 'opacity-50' : undefined}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{label}</label>
        {autoChip('px-2 py-0.5')}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={sliderValue}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={`flex-1 accent-dcs-accent ${auto ? 'opacity-60' : ''}`}
        />
        <input
          type="number"
          step={range.step}
          value={value ?? ''}
          placeholder={autoValue != null && Number.isFinite(autoValue) ? String(Math.round(autoValue * 100) / 100) : undefined}
          disabled={disabled}
          onChange={(e) => fromBox(e.target.value)}
          className={box}
        />
        <span className="w-6 text-xs text-gray-400">{range.unit}</span>
      </div>
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}
