import type { HTMLAttributes } from 'react';
import { GripVertical, ChevronDown } from 'lucide-react';
import type { EarningsOutlineSection } from '@/types/earnings';
import { SectionFlowPanel } from './SectionFlowPanel';
import { isFinancialSection } from './earnings-flags';
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
  figureCount,
  expanded,
  onToggleExpand,
  onRename,
}: {
  section: EarningsOutlineSection;
  number: number;
  group: 'included' | 'available';
  onToggle?: () => void;
  dragHandleProps?: HTMLAttributes<HTMLSpanElement> & { draggable?: boolean };
  /** Financial rows only — open shows the rename and the section's flow. */
  expanded?: boolean;
  onToggleExpand?: () => void;
  onRename?: (title: string) => Promise<void>;
  // How many of the company's own lines are currently going into this section.
  // Undefined for a section that renders no table; 0 is meaningful and shown, so
  // a section the model filed nothing into says so instead of looking broken.
  figureCount?: number;
}) {
  const isRequired = section.requirement === 'required';
  const openable = isFinancialSection(section) && !!onToggleExpand && !!onRename;
  const unavailable = group === 'available' && !section.available;
  const toggleDisabled = isRequired || unavailable;
  // Only render hint chips the backend actually provided — never fabricated.
  const hints = [section.source_type, section.mode, section.page_hint].filter(
    (h): h is string => !!h,
  );

  // What actually backs this section right now, per the outline feeder
  // (D-29). 'template' sections are self-evidently deterministic (Cover, TOC,
  // Sources) and need no attribution line at all.
  const feeder = section.feeder;
  // The RECOMMENDED badge is only honest when there's a real source behind
  // it right now — a recommended-tier section with no data yet (needs_input)
  // or one that's permanently external isn't something to recommend adding
  // this moment, whatever its static backend tier says.
  const dataReady = feeder?.status === 'ready';
  const feederText =
    !feeder || feeder.status === 'template'
      ? null
      : feeder.status === 'ready' && feeder.source_label
        ? `Sourced from ${feeder.source_label}`
        : feeder.message;
  const feederColor =
    feeder?.status === 'ready' ? ACCENT : feeder?.status === 'external' ? FAINT : '#B4730B';

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid #E8EAF3',
        background: isRequired ? '#FAFBFE' : '#fff',
        opacity: unavailable ? 0.55 : 1,
      }}
    >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
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
        {openable ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={!!expanded}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              border: 'none',
              background: 'none',
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13.5,
              fontWeight: 700,
              color: INK,
              lineHeight: 1.35,
              textAlign: 'left',
            }}
          >
            {section.title}
            <ChevronDown
              size={14}
              aria-hidden
              style={{
                flexShrink: 0,
                color: FAINT,
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform .16s ease-out',
              }}
            />
          </button>
        ) : (
          <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, lineHeight: 1.35 }}>
            {section.title}
          </div>
        )}
        {section.description && (
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>
            {section.description}
          </div>
        )}
        {feederText && (
          <div style={{ fontSize: 11, color: feederColor, marginTop: 3, fontWeight: 600 }}>
            {feederText}
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
        {section.requirement === 'recommended' && dataReady && <span className="badge b-gn">RECOMMENDED</span>}
        {figureCount !== undefined && (
          // A green chip on a section in "Available to add" read as an achievement
          // when it meant the opposite: work that is not in the report. Same number,
          // amber, and it says what removing the section would cost.
          <span
            className={
              figureCount === 0
                ? 'badge b-gy'
                : group === 'available'
                  ? 'badge b-am'
                  : 'badge b-gn'
            }
            title={
              figureCount > 0 && group === 'available'
                ? 'These figures are not in your report. Tick the section to keep them.'
                : undefined
            }
          >
            {figureCount} {figureCount === 1 ? 'FIGURE' : 'FIGURES'}
            {figureCount > 0 && group === 'available' ? ' · NOT IN REPORT' : ''}
          </span>
        )}
      </div>
    </div>

      {openable && expanded && (
        <SectionFlowPanel section={section} figureCount={figureCount} onRename={onRename} />
      )}
    </div>
  );
}
