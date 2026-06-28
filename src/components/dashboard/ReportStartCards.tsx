import { useNavigate } from 'react-router-dom';

// The three "start a report" cards (ESG / Quarterly / Annual). Shared between the
// first-run Welcome screen (full) and the personal Workspace dashboard (compact).

interface ReportCard {
  key: string;
  category: string;
  title: string;
  description: string;
  features: string[];
  cta: string;
  accent: string; // solid accent (text, checks, button)
  headerGradient: string;
  onOpen: (navigate: ReturnType<typeof useNavigate>) => void;
  icon: React.ReactNode;
}

const CARDS: ReportCard[] = [
  {
    key: 'esg',
    category: 'ESG & Corporate Intelligence',
    title: 'ESG Disclosure Report',
    description:
      'Compile CMA / Tadawul-aligned environmental, social, and governance disclosures with traceable GRI-coded metrics and AI-assisted narrative.',
    features: ['GRI-coded metrics', 'Materiality mapping', 'Assurance-ready'],
    cta: 'Open ESG Studio',
    accent: '#16A34A',
    headerGradient: 'linear-gradient(135deg,#14532D,#16A34A)',
    onOpen: (navigate) => navigate('/reports'),
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M10 2C7 6 6 8 6 11a4 4 0 0 0 8 0c0-3-1-5-4-9z" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'quarterly',
    category: 'Periodic Reporting',
    title: 'Quarterly Report',
    description:
      'Document-first quarterly results. Upload financials, let the AI extract figures and drivers, fill the gaps, and generate a YoY + YTD narrative.',
    features: ['Figure & driver extraction', 'Coverage map', 'YoY + YTD tables'],
    cta: 'Open Quarterly',
    accent: '#4040C8',
    headerGradient: 'linear-gradient(135deg,#2E2E9E,#4747CC)',
    onOpen: (navigate) => navigate('/reports/quarterly'),
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="3" width="14" height="14" rx="2" stroke="#fff" strokeWidth="1.4" />
        <path d="M3 8h14M8 8v9" stroke="#fff" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    key: 'annual',
    category: 'Periodic Reporting',
    title: 'Annual Report',
    description:
      'Orchestrate the full-year report end-to-end — set up a cycle, assign departments, collect submissions, and assemble the final integrated document.',
    features: ['Reporting cycles', 'Department workflow', 'Section assembly'],
    cta: 'Open Annual',
    accent: '#7C3AED',
    headerGradient: 'linear-gradient(135deg,#4C1D95,#7C3AED)',
    onOpen: (navigate) => navigate('/annual-report'),
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M5 2.5h7l3 3V17a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 5 17V3a.5.5 0 0 1 .5-.5z" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M12 2.5v3h3M7.5 10h5M7.5 13h3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

function Check({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="6.2" fill={color} opacity="0.12" />
      <path d="M4.3 7.2l1.9 1.9L9.8 5.2" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReportStartCards({ mini = false }: { mini?: boolean }) {
  const navigate = useNavigate();

  // Mini — slim horizontal tiles (icon + title + Open). Minimal screen area;
  // used on the personal workspace dashboard right under the hero.
  if (mini) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        {CARDS.map((c) => (
          <div key={c.key} className="card" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: c.headerGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {c.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: '#9BA3C4', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.category}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E', lineHeight: 1.1, letterSpacing: '-.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.title}
              </div>
            </div>
            <button
              type="button"
              onClick={() => c.onOpen(navigate)}
              style={{ fontSize: 11.5, fontWeight: 700, color: c.accent, background: `${c.accent}14`, border: 'none', borderRadius: 8, padding: '7px 11px', cursor: 'pointer', flexShrink: 0 }}
            >
              Open →
            </button>
          </div>
        ))}
      </div>
    );
  }

  // Full — the rich cards used on the first-run Welcome screen.
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      {CARDS.map((c) => (
        <div key={c.key} className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Coloured header — icon + title on one row */}
          <div
            style={{
              background: c.headerGradient,
              padding: '16px 18px',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              gap: 13,
            }}
          >
            <div style={{ position: 'absolute', top: -28, right: -28, width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,.09)', pointerEvents: 'none' }} />
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 11,
                background: 'rgba(255,255,255,.18)',
                border: '1px solid rgba(255,255,255,.22)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {c.icon}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)', marginBottom: 3 }}>
                {c.category}
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: '#fff', lineHeight: 1.15, letterSpacing: '-.2px' }}>
                {c.title}
              </div>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
            <p style={{ fontSize: 11.5, color: '#5A6080', lineHeight: 1.6, marginBottom: 14 }}>{c.description}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {c.features.map((f) => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#3A3F5C' }}>
                  <Check color={c.accent} />
                  {f}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => c.onOpen(navigate)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                border: 'none',
                background: c.accent,
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginTop: 'auto',
              }}
            >
              {c.cta} →
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ReportStartCards;
