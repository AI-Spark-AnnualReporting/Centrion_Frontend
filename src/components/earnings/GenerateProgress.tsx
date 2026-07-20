import type { EarningsProducedSection } from '@/types/earnings';
import { earningsSectionState } from '@/pages/earnings/preview-helpers';
import { INK, MUTED, ACCENT } from './tokens';

// Per-section production status shown while the produce run is polling. Sections
// that finished as `needs_input` are surfaced (amber), never hidden.
export function GenerateProgress({ sections }: { sections: EarningsProducedSection[] }) {
  return (
    <div className="card" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }} aria-hidden>
          <circle cx="12" cy="12" r="10" stroke={ACCENT} strokeWidth="3" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>Generating your report…</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sections.map((s) => {
          const state = earningsSectionState(s);
          const drafting = s.status === 'drafting';
          const label =
            drafting ? 'Drafting…'
              : state === 'produced' ? 'Produced'
                : state === 'needs_input' ? 'Needs input'
                  : 'Pending';
          const color =
            drafting ? ACCENT
              : state === 'produced' ? '#10B981'
                : state === 'needs_input' ? '#B45309'
                  : MUTED;
          return (
            <div
              key={s.section_code}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '7px 0' }}
            >
              <span style={{ fontSize: 13, color: INK }}>{s.title}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
