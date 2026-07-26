// The "pick up where you left off" shelf on the set-up screen. Same card face
// as the certified gallery below it, because it's the same object at an earlier
// stage — a validation run — just one nobody has signed off yet.
//
// Fed by GET /compliance/runs, so it shows runs that finished after the tab was
// closed and runs a colleague started. The browser only contributes which
// screen the user had open; the server owns everything else.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { complianceValidation } from '@/lib/api';
import { isDismissed, dismissRun, runHref } from '@/lib/compliance-runs';
import { relativeSince } from '@/lib/time';
import type { ReportType, RunListItem } from '@/types/compliance';
import { MONO, MUTED, safeScore } from './compliance-ui';

// Colour carries the state, so the shelf can be read without the labels.
// Certified runs never appear here — they graduate to the gallery below.
const FACE: Record<string, { gradient: string; label: string; action: string }> = {
  running: {
    gradient: 'linear-gradient(135deg,#1F2A6B,#3535B5)',
    label: 'Validating…',
    action: 'Resume →',
  },
  done: {
    gradient: 'linear-gradient(135deg,#334155,#475569)',
    label: 'Results ready',
    action: 'Continue →',
  },
  error: {
    gradient: 'linear-gradient(135deg,#7F1D1D,#B91C1C)',
    label: 'Didn’t finish',
    action: 'See what happened →',
  },
};

// "FY-2025" → "FY 2025". Mirrors the certified card.
function formatPeriod(period: string | undefined): string {
  return (period ?? '').replace(/[-_]/g, ' ').trim() || '—';
}

function sinceLabel(iso: string | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? '' : relativeSince(ms);
}

function ResumeCard({ run, onDismiss }: { run: RunListItem; onDismiss: () => void }) {
  const navigate = useNavigate();
  const face = FACE[run.status] ?? FACE.done;
  const score = safeScore(run.overall_readiness);
  // Where they left off, or where the run's state says they should be. Never a
  // guess about status — see lib/compliance-runs.
  const open = () => navigate(runHref(run));

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
          background: face.gradient,
          padding: '20px 20px 22px',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Ambient discs, same as the certified and report cards. */}
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

        {/* Dismiss is per-browser: it hides the card, it doesn't delete the run,
            which is why it's a quiet × rather than a labelled control. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          title="Hide this from the shelf"
          aria-label="Hide this from the shelf"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255,255,255,.16)',
            color: '#fff',
            fontSize: 14,
            lineHeight: 1,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          ×
        </button>

        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            opacity: 0.8,
            marginBottom: 10,
            position: 'relative',
            paddingRight: 34,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {run.title || 'Validation run'}
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
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              padding: '4px 9px',
              borderRadius: 999,
              background: 'rgba(255,255,255,.22)',
              fontFamily: MONO,
            }}
          >
            {/* A running run has no score yet, and a failed one never will. */}
            {run.status === 'done' && score != null ? `${score}/100` : face.label}
          </span>
          {run.source === 'upload' && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '4px 9px',
                borderRadius: 999,
                background: 'rgba(255,255,255,.16)',
              }}
            >
              Uploaded
            </span>
          )}
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
            color: '#4040C8',
            background: 'rgba(64,64,200,.1)',
            padding: '4px 10px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
          }}
        >
          {face.action}
        </span>
        <span style={{ fontSize: 10, color: '#9BA3C4', textAlign: 'right' }}>
          {sinceLabel(run.updated_at)}
        </span>
      </div>
    </div>
  );
}

export function ResumeGallery({
  companyId,
  reportType,
}: {
  companyId: string;
  reportType: ReportType;
}) {
  const [runs, setRuns] = useState<RunListItem[]>([]);
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
      .listRuns(companyId, { report_type: reportType, limit: 20 })
      .then((list) => {
        if (cancelled) return;
        // Certified runs have their own shelf below — showing them twice would
        // make "pick up where you left off" a list of finished business.
        setRuns(list.filter((r) => !r.certified && !isDismissed(r.run_id)));
      })
      // Supporting content: if it fails to load it stays hidden rather than
      // putting an error banner between the user and the run they came to do.
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

  const hide = (runId: string) => {
    dismissRun(runId);
    setRuns((prev) => prev.filter((r) => r.run_id !== runId));
  };

  // Nothing outstanding is the normal state — show nothing at all rather than
  // an empty shelf explaining itself.
  if (loading || runs.length === 0) return null;

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>
          Pick up where you left off
        </span>
        <span style={{ fontSize: 11, color: MUTED }}>
          {runs.length} not signed off · newest first
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {runs.map((run) => (
          <ResumeCard key={run.run_id} run={run} onDismiss={() => hide(run.run_id)} />
        ))}
      </div>
    </div>
  );
}

export default ResumeGallery;
