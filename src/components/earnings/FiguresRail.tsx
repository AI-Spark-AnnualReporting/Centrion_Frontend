// The whole job, at a glance.
//
// Nine sections stacked down a page tell you nothing about how far through you
// are or what is left. This does: every section, its count, and which one you are
// looking at. Same shape as the preview's SectionRail so the two screens feel like
// one product.

import type { EarningsFigureSection } from '@/types/earnings';
import { INK, MUTED, FAINT, ACCENT, ACCENT_TINT, BORDER_SOFT } from './tokens';

export function FiguresRail({
  sections,
  activeCode,
  onSelect,
  onAddSection,
}: {
  sections: EarningsFigureSection[];
  activeCode: string | null;
  onSelect: (code: string) => void;
  /** Back to the Outline — the only place the section set is decided. */
  onAddSection?: () => void;
}) {
  const filled = sections.filter((s) => s.total > 0).length;

  return (
    <div className="card" style={{ padding: 0, position: 'sticky', top: 12 }}>
      <div
        style={{
          padding: '12px 14px',
          borderBottom: `1px solid ${BORDER_SOFT}`,
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '.6px',
          textTransform: 'uppercase',
          color: FAINT,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span>Sections</span>
        <span style={{ color: filled ? ACCENT : FAINT }}>
          {filled} of {sections.length}
        </span>
      </div>

      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sections.map((s) => {
          const active = s.section_code === activeCode;
          const has = s.total > 0;
          return (
            <button
              key={s.section_code}
              type="button"
              onClick={() => onSelect(s.section_code)}
              aria-current={active ? 'true' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                textAlign: 'left',
                padding: '7px 9px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                background: active ? ACCENT_TINT : 'transparent',
                font: 'inherit',
                transition: 'background .12s',
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 11.5,
                  fontWeight: active ? 700 : 500,
                  color: active ? ACCENT : has ? INK : MUTED,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.title}
              </span>
              {/* Only a real count earns a chip. A grey zero on every row would
                  read as nine failures rather than nine things not started. */}
              {has ? (
                <span
                  style={{
                    flexShrink: 0,
                    minWidth: 20,
                    padding: '0 6px',
                    height: 18,
                    borderRadius: 18,
                    background: active ? '#fff' : ACCENT_TINT,
                    color: ACCENT,
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 10.5,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {s.total}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    width: 5,
                    height: 5,
                    borderRadius: 5,
                    background: '#DDE0EE',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* The honest answer to "where are the other sections". The Outline is the
          only place the section set is decided, and this screen no longer offers
          sections that are not in the report. */}
      {onAddSection && (
        <button
          type="button"
          onClick={onAddSection}
          style={{
            width: '100%',
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
