// Every section of the report, in one list, in report order.
//
// The screen this replaces showed only the nine financial sections, stacked, and
// the narrative ones did not exist until the report was already produced. You
// could not see the report taking shape while you shaped it. So the rail carries
// all of them, and the state beside each says what it needs from you: a figure
// count where figures are the work, written-or-not where prose is.
//
// Cover & colours sits above the sections and behaves like one, because choosing
// a cover is shaping the report too — it just is not a section of it.

import { INK, MUTED, FAINT, ACCENT, ACCENT_TINT, BORDER_SOFT } from './tokens';

export const COVER_CODE = '__cover__';

export interface RailItem {
  code: string;
  title: string;
  kind: 'financial' | 'narrative';
  /** financial: how many figures are filed here. narrative: undefined. */
  figures?: number;
  /** narrative: has it been written yet. financial: undefined. */
  written?: boolean;
}

function Dot({ done }: { done: boolean }) {
  return done ? (
    <span
      aria-hidden
      style={{
        flexShrink: 0,
        width: 15,
        height: 15,
        borderRadius: 15,
        background: '#DCFCE7',
        color: '#15803D',
        fontSize: 9,
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      ✓
    </span>
  ) : (
    <span
      aria-hidden
      style={{
        flexShrink: 0,
        width: 15,
        height: 15,
        borderRadius: 15,
        border: `1.5px solid #DDE0EE`,
        background: '#fff',
      }}
    />
  );
}

export function PreviewRail({
  items,
  activeCode,
  onSelect,
  onAddSection,
}: {
  items: RailItem[];
  activeCode: string | null;
  onSelect: (code: string) => void;
  /** Back to the Outline — the only place the section set is decided. */
  onAddSection?: () => void;
}) {
  const done = items.filter((i) =>
    i.kind === 'financial' ? (i.figures ?? 0) > 0 : !!i.written,
  ).length;

  const row = (
    key: string,
    label: string,
    active: boolean,
    left: React.ReactNode,
    right: React.ReactNode,
    onClick: () => void,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-current={active || undefined}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '8px 12px',
        border: 'none',
        borderLeft: `2px solid ${active ? ACCENT : 'transparent'}`,
        background: active ? ACCENT_TINT : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      {left}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          fontWeight: active ? 700 : 500,
          color: active ? INK : MUTED,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {right}
    </button>
  );

  return (
    <div
      className="card"
      style={{
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          flexShrink: 0,
          borderBottom: `1px solid ${BORDER_SOFT}`,
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '.6px',
          textTransform: 'uppercase',
          color: FAINT,
        }}
      >
        <span>Sections</span>
        <span style={{ fontFamily: "'DM Mono', monospace", color: done ? ACCENT : FAINT }}>
          {done}/{items.length}
        </span>
      </div>

      {/* Not a section, but the same kind of decision. */}
      {row(
        COVER_CODE,
        'Cover & colours',
        activeCode === COVER_CODE,
        <span aria-hidden style={{ flexShrink: 0, fontSize: 12, color: FAINT }}>
          ▣
        </span>,
        null,
        () => onSelect(COVER_CODE),
      )}

      <div style={{ borderTop: `1px solid ${BORDER_SOFT}`, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {items.map((i) =>
          row(
            i.code,
            i.title,
            activeCode === i.code,
            <Dot done={i.kind === 'financial' ? (i.figures ?? 0) > 0 : !!i.written} />,
            i.kind === 'financial' ? (
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: (i.figures ?? 0) > 0 ? ACCENT : FAINT,
                }}
              >
                {i.figures ?? 0}
              </span>
            ) : (
              <span style={{ flexShrink: 0, fontSize: 10, color: FAINT }}>
                {i.written ? '' : 'not run'}
              </span>
            ),
            () => onSelect(i.code),
          ),
        )}
      </div>

      {onAddSection && (
        <button
          type="button"
          onClick={onAddSection}
          style={{
            width: '100%',
            flexShrink: 0,
            border: 'none',
            borderTop: `1px solid ${BORDER_SOFT}`,
            background: 'none',
            padding: '10px 14px',
            textAlign: 'left',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 11.5,
            fontWeight: 700,
            color: ACCENT,
          }}
        >
          + Add a section
        </button>
      )}
    </div>
  );
}
