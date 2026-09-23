import type { ReactNode } from 'react';
import type { KnobRange } from '../../lib/customizeKnobs';

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

/**
 * One Customize number: a slider to drag for a feel of it, and a box beside it
 * for an exact value. Both drive the same field, so the map redraws on every
 * tick of the slider and on every keystroke in the box.
 *
 * The slider's range is a convenience, not a limit. The box takes any finite
 * number, and a value past either end just pins the slider there. The tool
 * warns about questionable numbers elsewhere and never blocks them.
 */
export function SliderField({ label, range, value, onChange, autoValue, onAuto, isAuto, disabled = false, hint }: SliderFieldProps) {
  const auto = isAuto ?? value === undefined;
  const shown = value ?? autoValue;
  const sliderValue = shown != null && Number.isFinite(shown) ? Math.min(Math.max(shown, range.min), range.max) : range.min;

  const fromBox = (text: string) => {
    const v = parseFloat(text);
    if (Number.isFinite(v)) onChange(v);
    else if (text.trim() === '' && onAuto) onAuto();
  };

  return (
    <div className={disabled ? 'opacity-50' : undefined}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{label}</label>
        {onAuto && (
          <button
            type="button"
            disabled={disabled}
            onClick={onAuto}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              auto ? 'bg-dcs-blue border-blue-400 text-white' : 'border-gray-600 text-gray-400 hover:text-white hover:border-gray-400'
            }`}
            title="Let the geometry set this number"
          >
            Auto
          </button>
        )}
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
