import { DollarSign, RotateCcw } from 'lucide-react';

export const SALARY_SLIDER_MIN = 0;
export const SALARY_SLIDER_MAX = 250000;
export const SALARY_SLIDER_STEP = 5000;

interface SalaryRangeSliderProps {
  minSalary: number;
  maxSalary: number;
  includeUndisclosed: boolean;
  disclosedCount?: number;
  onChange: (nextMin: number, nextMax: number) => void;
  onIncludeUndisclosedChange: (next: boolean) => void;
  onReset: () => void;
}

export function formatSalaryShort(amount: number, currency?: string | null): string {
  const symbol =
    currency === 'EUR'
      ? '€'
      : currency === 'GBP'
        ? '£'
        : '$';
  if (amount <= 0) return `${symbol}0`;
  if (amount >= 1000) {
    const k = Math.round(amount / 1000);
    return `${symbol}${k}k`;
  }
  return `${symbol}${amount.toLocaleString()}`;
}

export function formatJobSalaryBadge(
  min?: number | null,
  max?: number | null,
  currency?: string | null
): string | null {
  if (!min && !max) return null;
  const low = min ?? max ?? 0;
  const high = max ?? min ?? 0;
  if (low <= 0 && high <= 0) return null;
  if (low === high) return `${formatSalaryShort(low, currency)}/yr`;
  return `${formatSalaryShort(low, currency)}–${formatSalaryShort(high, currency)}/yr`;
}

export function SalaryRangeSlider({
  minSalary,
  maxSalary,
  includeUndisclosed,
  disclosedCount,
  onChange,
  onIncludeUndisclosedChange,
  onReset,
}: SalaryRangeSliderProps) {
  const isActive = minSalary > SALARY_SLIDER_MIN || maxSalary < SALARY_SLIDER_MAX;
  const minPct = (minSalary / SALARY_SLIDER_MAX) * 100;
  const maxPct = (maxSalary / SALARY_SLIDER_MAX) * 100;
  const activeWidthPct = Math.max(0, maxPct - minPct);

  const rangeLabel = !isActive
    ? 'Any salary'
    : maxSalary >= SALARY_SLIDER_MAX
      ? `${formatSalaryShort(minSalary)}+ / yr`
      : minSalary <= SALARY_SLIDER_MIN
        ? `Up to ${formatSalaryShort(maxSalary)} / yr`
        : `${formatSalaryShort(minSalary)} – ${formatSalaryShort(maxSalary)} / yr`;

  const handleMinChange = (rawVal: number) => {
    const clamped = Math.min(rawVal, maxSalary - SALARY_SLIDER_STEP);
    onChange(Math.max(SALARY_SLIDER_MIN, clamped), maxSalary);
  };

  const handleMaxChange = (rawVal: number) => {
    const clamped = Math.max(rawVal, minSalary + SALARY_SLIDER_STEP);
    onChange(minSalary, Math.min(SALARY_SLIDER_MAX, clamped));
  };

  return (
    <div className="pt-3 mt-1 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
          <DollarSign className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
          <span>Salary Range</span>
        </span>

        <span
          className={`px-2 py-0.5 text-xs font-mono font-medium rounded-md tabular-nums ${
            isActive
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {rangeLabel}
        </span>

        {typeof disclosedCount === 'number' && (
          <span className="text-[11px] text-slate-500 tabular-nums">
            ({disclosedCount} roles list pay)
          </span>
        )}
      </div>

      {/* Dual-Thumb Range Track */}
      <div className="flex-1 max-w-xl flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[220px]">
          <span className="text-[11px] font-mono text-slate-500 tabular-nums w-9 shrink-0">
            {formatSalaryShort(minSalary)}
          </span>

          <div className="relative flex-1 h-7 flex items-center select-none">
            {/* SVG Track & Active Range Highlight */}
            <svg
              viewBox="0 0 100 6"
              preserveAspectRatio="none"
              className="w-full h-1.5 rounded-full overflow-hidden pointer-events-none"
              aria-hidden="true"
            >
              <rect x="0" y="0" width="100" height="6" rx="3" fill="#e2e8f0" />
              <rect
                x={minPct}
                y="0"
                width={activeWidthPct}
                height="6"
                rx="3"
                fill="#2563eb"
              />
            </svg>

            {/* Min Thumb */}
            <input
              type="range"
              aria-label="Minimum annual salary"
              min={SALARY_SLIDER_MIN}
              max={SALARY_SLIDER_MAX}
              step={SALARY_SLIDER_STEP}
              value={minSalary}
              onChange={(e) => handleMinChange(Number(e.target.value))}
              className={`pointer-events-none absolute inset-0 w-full h-full appearance-none bg-transparent focus:outline-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-transform [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-600 [&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:cursor-grab ${
                minSalary > SALARY_SLIDER_MAX - 25000 ? 'z-20' : 'z-10'
              }`}
            />

            {/* Max Thumb */}
            <input
              type="range"
              aria-label="Maximum annual salary"
              min={SALARY_SLIDER_MIN}
              max={SALARY_SLIDER_MAX}
              step={SALARY_SLIDER_STEP}
              value={maxSalary}
              onChange={(e) => handleMaxChange(Number(e.target.value))}
              className="pointer-events-none absolute inset-0 z-10 w-full h-full appearance-none bg-transparent focus:outline-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-transform [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-600 [&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:cursor-grab"
            />
          </div>

          <span className="text-[11px] font-mono text-slate-500 tabular-nums w-12 text-right shrink-0">
            {maxSalary >= SALARY_SLIDER_MAX ? '$250k+' : formatSalaryShort(maxSalary)}
          </span>
        </div>

        {/* Controls shown when salary filter is narrowed */}
        <div className="flex items-center gap-3 shrink-0">
          <label
            className={`inline-flex items-center gap-1.5 text-xs select-none cursor-pointer ${
              isActive ? 'text-slate-700' : 'text-slate-400 pointer-events-none'
            }`}
          >
            <input
              type="checkbox"
              checked={includeUndisclosed}
              disabled={!isActive}
              onChange={(e) => onIncludeUndisclosedChange(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            <span className="whitespace-nowrap">Include unlisted</span>
          </label>

          {isActive && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
