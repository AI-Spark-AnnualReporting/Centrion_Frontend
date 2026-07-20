import type { EarningsProducedSection } from '@/types/earnings';
import { earningsSectionState } from '@/pages/earnings/preview-helpers';
import { INK, MUTED, FAINT, ACCENT, ACCENT_TINT } from './tokens';

// A tri-state status dot for a section: produced (green), needs input (amber),
// drafting (indigo spinner), empty (grey).
function StatusDot({ section }: { section: EarningsProducedSection }) {
  if (section.status === 'drafting') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }} aria-hidden>
        <circle cx="12" cy="12" r="10" stroke={ACCENT} strokeWidth="3" strokeOpacity="0.25" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  const state = earningsSectionState(section);
  const color = state === 'produced' ? '#10B981' : state === 'needs_input' ? '#F59E0B' : '#C9CDE4';
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} aria-hidden />;
}

// Left navigation rail: cover + sections in display order. Clicking selects/scrolls.
export function SectionRail({
  sections,
  activeCode,
  onSelect,
}: {
  sections: EarningsProducedSection[];
  activeCode: string | null;
  onSelect: (code: string) => void;
}) {
  const produced = sections.filter((s) => earningsSectionState(s) === 'produced').length;
  return (
    <div className="card" style={{ padding: 0, position: 'sticky', top: 12 }}>
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid #ECEEF8',
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '.6px',
          textTransform: 'uppercase',
          color: FAINT,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Pages · {sections.length}</span>
        <span style={{ color: ACCENT }}>{produced} ready</span>
      </div>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sections.map((s) => {
          const active = s.section_code === activeCode;
          return (
            <button
              key={s.section_code}
              type="button"
              onClick={() => onSelect(s.section_code)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '8px 10px',
                borderRadius: 8,
                border: 0,
                background: active ? ACCENT_TINT : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <StatusDot section={s} />
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: active ? 700 : 500,
                  color: active ? INK : MUTED,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {s.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
