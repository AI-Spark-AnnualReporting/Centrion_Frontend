// The certified-reports shelf on the set-up screen. Card face mirrors the
// report gallery on /reports (gradient header, big period, footer strip) so the
// two read as the same object — with a certification seal and watermark that
// only a signed-off run gets.
//
// A card opens its run in read-only mode: certification is a record of what was
// true at sign-off, not a workspace.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { complianceValidation } from '@/lib/api';
import type { CertifiedRun, ReportType } from '@/types/compliance';
import { MONO, MUTED, safeScore } from './compliance-ui';

// Deep, saturated backs that make the white seal and watermark read. Cycled so
// consecutive cards look distinct without the backend having to style them.
const CERTIFIED_GRADIENTS = [
  'linear-gradient(135deg,#1F2A6B,#3535B5)',
  'linear-gradient(135deg,#065F46,#059669)',
  'linear-gradient(135deg,#4C1D95,#7C3AED)',
] as const;

// "2026-07-22T00:28:53Z" → "Jul 22, 2026". Matches the report gallery's footer.
function formatCertifiedDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// "FY-2025" → "FY 2025", "Q1-2026" → "Q1 2026". The API's own string is the
// fallback, so an unfamiliar format still renders rather than vanishing.
function formatPeriod(period: string | undefined): string {
  return (period ?? '').replace(/[-_]/g, ' ').trim() || '—';
}

// The seal: a stamped roundel in the corner of the gradient. Drawn rather than
// imported so it inherits the card's white-on-colour treatment exactly.
function CertifiedSeal() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 14,
        right: 14,
        width: 54,
        height: 54,
        borderRadius: '50%',
        border: '1.5px solid rgba(255,255,255,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,.12)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '1px dashed rgba(255,255,255,.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 800 }}>✓</span>
        <span style={{ fontSize: 6, fontWeight: 800, letterSpacing: '.6px', marginTop: 2 }}>
          CERTIFIED
        </span>
      </div>
    </div>
  );
}

function CertifiedCard({ run, gradient }: { run: CertifiedRun; gradient: string }) {
  const navigate = useNavigate();
  const score = safeScore(run.overall_readiness);
  const open = () => navigate(`/compliance/runs/${run.run_id}`);

  const chips = [
    run.entity_type ? run.entity_type[0].toUpperCase() + run.entity_type.slice(1) : null,
    run.market,
    // Certified runs carry their source too, and an uploaded one is titled with
    // the filename — worth saying so, since that title looks unlike the ones we
    // generate ourselves.
    run.source === 'upload' ? 'Uploaded' : null,
  ].filter(Boolean) as string[];

  return (
    <div
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      title={`Certified by ${run.certified_by} · view the results`}
      style={{
        background: '#fff',
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid #E2E4F0',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        transition: 'transform .15s ease, box-shadow .15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 22px rgba(26,29,46,.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div
        style={{
          background: gradient,
          padding: '20px 20px 22px',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Ambient discs, same as the report gallery cards. */}
        <div
          style={{
            position: 'absolute',
            top: -34,
            right: -34,
            width: 124,
            height: 124,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.08)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -48,
            right: 26,
            width: 84,
            height: 84,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.05)',
          }}
        />

        {/* The watermark — outlined, rotated, and low-contrast so it reads as a
            stamp behind the content rather than a second headline competing
            with the period. pointerEvents off so it never eats the click. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: -8,
            bottom: -14,
            transform: 'rotate(-12deg)',
            fontSize: 46,
            fontWeight: 800,
            letterSpacing: '2px',
            color: 'transparent',
            WebkitTextStroke: '1.4px rgba(255,255,255,.22)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          CERTIFIED
        </div>

        <CertifiedSeal />

        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            opacity: 0.8,
            marginBottom: 10,
            position: 'relative',
            paddingRight: 60,
          }}
        >
          {run.title || 'Report'}
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-.5px',
            marginBottom: 14,
            position: 'relative',
          }}
        >
          {formatPeriod(run.period)}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, position: 'relative' }}>
          {/* The score at sign-off. Null means nothing was scoreable, which is
              still a fact worth stating — just not as a 0. */}
          <span
            title="Submission readiness at the moment of certification"
            style={{
              fontSize: 10,
              fontWeight: 800,
              padding: '4px 9px',
              borderRadius: 999,
              background: 'rgba(255,255,255,.22)',
              fontFamily: MONO,
            }}
          >
            {score == null ? 'NOT SCORED' : `${score}/100`}
          </span>
          {chips.map((c) => (
            <span
              key={c}
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '4px 9px',
                borderRadius: 999,
                background: 'rgba(255,255,255,.16)',
              }}
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flex: 1,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#16A34A',
            background: 'rgba(34,197,94,.1)',
            padding: '4px 10px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
          }}
        >
          View results →
        </span>
        <span
          style={{ fontSize: 10, color: '#9BA3C4', textAlign: 'right' }}
          title={`Certified by ${run.certified_by}`}
        >
          Certified {formatCertifiedDate(run.certified_at)}
        </span>
      </div>
    </div>
  );
}

export function CertifiedGallery({
  companyId,
  reportType,
}: {
  companyId: string;
  reportType: ReportType;
}) {
  const [runs, setRuns] = useState<CertifiedRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (!companyId) {
      setRuns([]);
      setLoading(false);
      return;
    }
    complianceValidation
      .listCertified(companyId, reportType)
      .then((list) => {
        if (!cancelled) setRuns(list);
      })
      // A gallery of past certifications is supporting content — if it fails to
      // load it stays hidden rather than putting an error banner between the
      // user and the validation they came here to run.
      .catch(() => {
        if (!cancelled) setRuns([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reportType]);

  // Nothing certified yet is the normal starting state, not an empty-state to
  // apologise for — show nothing at all.
  if (loading || runs.length === 0) return null;

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>Certified reports</span>
        <span style={{ fontSize: 11, color: MUTED }}>
          {runs.length} signed off · newest first
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {runs.map((run, i) => (
          <CertifiedCard
            key={run.run_id}
            run={run}
            gradient={CERTIFIED_GRADIENTS[i % CERTIFIED_GRADIENTS.length]}
          />
        ))}
      </div>
    </div>
  );
}

export default CertifiedGallery;
