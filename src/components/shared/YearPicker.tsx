import { useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getYearRange } from '@/lib/yearRange';

const PRIMARY = '#4040C8';

// 7 columns × 3 rows = 21 boxes = this year ± 10, so this year always sits in
// the exact centre of the grid.
const COLUMNS = 7;

/** Where keyboard focus should land when the grid opens. */
function getStartingYear(value: number | null, years: number[]): number {
  if (value !== null && years.includes(value)) return value;
  return new Date().getFullYear();
}

/** The year an arrow key moves to, or null if the key isn't a move key. */
function getYearForKey(key: string, current: number): number | null {
  if (key === 'ArrowLeft') return current - 1;
  if (key === 'ArrowRight') return current + 1;
  if (key === 'ArrowUp') return current - COLUMNS;
  if (key === 'ArrowDown') return current + COLUMNS;
  return null;
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="#5A6080" strokeWidth="1.3" />
      <path d="M1.5 5.5h11M4.5 1v3M9.5 1v3" stroke="#5A6080" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Background, text and border for one year box, based on its state. */
function getBoxStyle(isPicked: boolean, isThisYear: boolean, isHovered: boolean): CSSProperties {
  let background = '#fff';
  let color = '#1A1D2E';
  let border = '1.5px solid #ECEEF8';
  if (isHovered) background = 'rgba(64,64,200,.07)';
  if (isThisYear) border = `1.5px solid ${PRIMARY}`;
  if (isPicked) {
    background = PRIMARY;
    color = '#fff';
    border = `1.5px solid ${PRIMARY}`;
  }
  return {
    height: 36,
    borderRadius: 8,
    border,
    background,
    color,
    fontSize: 12,
    fontWeight: isPicked || isThisYear ? 800 : 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: '.12s',
  };
}

const linkStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  fontSize: 11.5,
  fontWeight: 700,
  color: PRIMARY,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

/**
 * A field that opens a grid of year boxes (this year ± 10) to click on.
 * A value outside the window (an old saved cycle) is still shown in the field;
 * it just can't be picked again from the grid.
 */
export function YearPicker({
  value,
  onChange,
  id,
  placeholder = 'Select year',
  ariaLabel = 'Fiscal year',
}: {
  value: number | null;
  onChange: (year: number) => void;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const years = getYearRange();
  const thisYear = new Date().getFullYear();
  const firstYear = years[0];
  const lastYear = years[years.length - 1];

  const [open, setOpen] = useState(false);
  const [focusedYear, setFocusedYear] = useState<number>(getStartingYear(value, years));
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  // One button per year, so arrow keys can move real browser focus.
  const boxRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const focusYear = (year: number) => {
    setFocusedYear(year);
    boxRefs.current.get(year)?.focus();
  };

  const pickYear = (year: number) => {
    onChange(year);
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) setFocusedYear(getStartingYear(value, years));
    setOpen(next);
  };

  const handleGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = getYearForKey(e.key, focusedYear);
    if (target === null) return;
    e.preventDefault();
    // Stay inside the window instead of wrapping around.
    if (target < firstYear || target > lastYear) return;
    focusYear(target);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className="inp"
          aria-label={value !== null ? `${ariaLabel}, ${value}` : ariaLabel}
          aria-haspopup="dialog"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            textAlign: 'left',
            // Match the `.fl input` rule (index.css) the neighbouring text and
            // date fields get, so this field is exactly the same height.
            padding: '11px 14px',
            fontSize: 13,
            lineHeight: 1.5,
            cursor: 'pointer',
            color: value !== null ? '#1A1D2E' : '#9BA3C4',
          }}
        >
          <span>{value !== null ? value : placeholder}</span>
          <CalendarIcon />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        // Our own look instead of the default shadcn popover box.
        className="p-0 w-auto border-0 bg-transparent shadow-none"
        // Must sit above `.modal-overlay` (z-index 10001 in index.css) so the
        // grid isn't hidden behind the Edit Cycle popup.
        style={{ zIndex: 10050 }}
        // Radix would focus the panel itself; put focus on a year instead.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          boxRefs.current.get(focusedYear)?.focus();
        }}
      >
        <div
          style={{
            width: 372,
            padding: 14,
            background: '#fff',
            border: '1.5px solid #E2E4F0',
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(26,29,46,.14)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#1A1D2E', textTransform: 'uppercase', letterSpacing: '.4px' }}>
              Pick a year
            </span>
            <span style={{ fontSize: 11, color: '#9BA3C4' }}>
              {firstYear} – {lastYear}
            </span>
          </div>

          <div
            role="listbox"
            aria-label={ariaLabel}
            onKeyDown={handleGridKeyDown}
            style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`, gap: 6 }}
          >
            {years.map((year) => {
              const isPicked = year === value;
              const isThisYear = year === thisYear;
              return (
                <button
                  key={year}
                  type="button"
                  role="option"
                  aria-selected={isPicked}
                  aria-label={isThisYear ? `${year}, this year` : String(year)}
                  // Only the focused box is in the Tab order; arrows move between the rest.
                  tabIndex={year === focusedYear ? 0 : -1}
                  ref={(el) => {
                    if (el) boxRefs.current.set(year, el);
                    else boxRefs.current.delete(year);
                  }}
                  onClick={() => pickYear(year)}
                  onFocus={() => setFocusedYear(year)}
                  onMouseEnter={() => setHoveredYear(year)}
                  onMouseLeave={() => setHoveredYear(null)}
                  style={getBoxStyle(isPicked, isThisYear, hoveredYear === year && !isPicked)}
                >
                  {year}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 10,
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid #ECEEF8',
              fontSize: 11.5,
              color: '#9BA3C4',
            }}
          >
            <button type="button" style={linkStyle} onClick={() => pickYear(thisYear - 1)}>
              Last year ({thisYear - 1})
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" style={linkStyle} onClick={() => pickYear(thisYear)}>
              This year ({thisYear})
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
