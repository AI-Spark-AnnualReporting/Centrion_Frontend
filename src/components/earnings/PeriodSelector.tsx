import type { EarningsVariant, EarningsQuarter } from '@/types/earnings';
import { EARNINGS_QUARTERS } from '@/types/earnings';
import { earningsYearOptions } from '@/pages/earnings/helpers';

// Block 2 — variant-aware reporting period. Annual → fiscal year only;
// Quarterly → fiscal year + quarter (Q1–Q4).
export function PeriodSelector({
  variant,
  fiscalYear,
  quarter,
  onYearChange,
  onQuarterChange,
}: {
  variant: EarningsVariant;
  fiscalYear: number | null;
  quarter: EarningsQuarter | null;
  onYearChange: (y: number | null) => void;
  onQuarterChange: (q: EarningsQuarter) => void;
}) {
  const years = earningsYearOptions();
  const isQuarterly = variant === 'quarterly';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isQuarterly ? '1fr 1fr' : '1fr',
        gap: 12,
      }}
    >
      <div>
        <label className="fl-label">Fiscal Year</label>
        <select
          className="inp sel"
          value={fiscalYear ?? ''}
          onChange={(e) => onYearChange(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="" disabled>
            Select fiscal year…
          </option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {isQuarterly && (
        <div>
          <label className="fl-label">Quarter</label>
          <select
            className="inp sel"
            value={quarter ?? ''}
            onChange={(e) => onQuarterChange(Number(e.target.value) as EarningsQuarter)}
          >
            <option value="" disabled>
              Select quarter…
            </option>
            {EARNINGS_QUARTERS.map((q) => (
              <option key={q} value={q}>
                Q{q}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
