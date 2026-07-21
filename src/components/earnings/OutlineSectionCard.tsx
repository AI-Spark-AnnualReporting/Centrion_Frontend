import type { HTMLAttributes } from 'react';
import { GripVertical } from 'lucide-react';
import type { EarningsOutlineSection } from '@/types/earnings';
import { INK, MUTED, FAINT, ACCENT } from './tokens';

// A custom checkbox button (mirrors the quarterly outline's report-area check) so
// the toggle reads as on/off/disabled with proper a11y roles.
function CheckBox({
  checked,
  disabled,
  onToggle,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-label={label}
      onClick={
        disabled
          ? undefined
          : (e) => {
              e.stopPropagation();
              onToggle?.();
            }
      }
      style={{
        width: 18,
        height: 18,
        padding: 0,
        borderRadius: 5,
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: checked ? 'none' : '1.5px solid #C9CDE4',
        background: checked ? ACCENT : '#fff',
        opacity: disabled && !checked ? 0.6 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.2l2.2 2.2L9.5 3.6"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

// One section row. Used in both groups:
//  • "Report sections" (group='included') — draggable (dragHandleProps present),
//    required rows show the toggle on + disabled.
//  • "Available to add" (group='available') — not draggable; an optional with
//    available=false is greyed, toggle disabled, with a short reason.
export function OutlineSectionCard({
  section,
  number,
  group,
  onToggle,
  dragHandleProps,
}: {
  section: EarningsOutlineSection;
  number: number;
  group: 'included' | 'available';
  onToggle?: () => void;
  dragHandleProps?: HTMLAttributes<HTMLSpanElement> & { draggable?: boolean };
}) {
  const isRequired = section.requirement === 'required';
  const unavailable = group === 'available' && !section.available;
  const toggleDisabled = isRequired || unavailable;
  // Only render hint chips the backend actually provided — never fabricated.
  const hints = [section.source_type, section.mode, section.page_hint].filter(
    (h): h is string => !!h,
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        borderRadius: 12,
        border: '1px solid #E8EAF3',
        background: isRequired ? '#FAFBFE' : '#fff',
        opacity: unavailable ? 0.55 : 1,
      }}
    >
      {/* Lead: grip handle (only for the reorderable included group). */}
      {dragHandleProps ? (
        <span
          {...dragHandleProps}
          role="button"
          tabIndex={0}
          aria-label={`Reorder ${section.title}`}
          title="Drag to reorder (or use arrow keys)"
          style={{
            display: 'inline-flex',
            flexShrink: 0,
            cursor: 'grab',
            color: FAINT,
            outlineOffset: 2,
          }}
        >
          <GripVertical size={16} aria-hidden />
        </span>
      ) : (
        <span style={{ width: 16, flexShrink: 0 }} aria-hidden />
      )}

      <CheckBox
        checked={section.included}
        disabled={toggleDisabled}
        onToggle={onToggle}
        label={section.included ? `Exclude ${section.title}` : `Include ${section.title}`}
      />

      <span
        style={{
          width: 22,
          fontSize: 12,
          fontWeight: 700,
          color: FAINT,
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
        }}
      >
        {section.section_number ?? number}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, lineHeight: 1.35 }}>
          {section.title}
        </div>
        {section.description && (
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>
            {section.description}
          </div>
        )}
        {unavailable && (
          <div style={{ fontSize: 11, color: FAINT, marginTop: 3, fontWeight: 600 }}>
            No data for this section
          </div>
        )}
      </div>

      {/* Badges: backend hint chips + a REQUIRED marker. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {hints.map((h) => (
          <span key={h} className="badge b-gy">
            {h}
          </span>
        ))}
        {isRequired && <span className="badge b-gy">REQUIRED</span>}
        {section.requirement === 'recommended' && <span className="badge b-gn">RECOMMENDED</span>}
      </div>
    </div>
  );
}
