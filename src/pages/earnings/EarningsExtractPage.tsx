import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { earnings } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import type {
  EarningsFigure,
  EarningsSourceLine,
  EarningsUnfilledMetric,
} from '@/types/earnings';
import { FigureChecklist } from '@/components/earnings/FigureChecklist';
import { EarningsStepper } from '@/components/earnings/EarningsStepper';
import { INK, MUTED } from '@/components/earnings/tokens';

export default function EarningsExtractPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  // companyId isn't needed by the figures endpoints (report-scoped), but we read
  // it defensively so a null user never crashes the page.
  void (user?.company_id ?? null);

  // The step-2 picker. Auto-matching fills only the metrics whose labels match
  // the registry exactly, so this is how the rest get filled at all.
  const [lines, setLines] = useState<EarningsSourceLine[]>([]);
  const [suggestedCount, setSuggestedCount] = useState(0);
  const [binding, setBinding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // One load, one request: the checklist IS the screen. There is no separate
  // figure set any more — a figure exists because the user ticked a line.
  useEffect(() => {
    if (!reportId) {
      setError('Missing report id.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    earnings
      .getEarningsSourceLines(reportId)
      .then((sl) => {
        if (cancelled) return;
        setLines(sl.lines);
        setSuggestedCount(sl.suggested_count ?? 0);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your report lines.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, retryKey]);

  const handleSaveSelection = useCallback(
    async (lineIds: string[]) => {
      if (!reportId) return;
      setBinding(true);
      try {
        await earnings.selectEarningsLines(reportId, lineIds);
        const sl = await earnings.getEarningsSourceLines(reportId);
        setLines(sl.lines);
        setSuggestedCount(sl.suggested_count ?? 0);
      } finally {
        setBinding(false);
      }
    },
    [reportId],
  );


  const goOutline = () => navigate(`/earnings/${reportId}/outline`);
  const handleContinue = () => goOutline();

  return (
    <div>
      <EarningsStepper activeStep={2} reportId={reportId} />
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 4px' }}>
          Choose your figures
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
          Tick the figures from your quarterly report that belong in this earnings report.
        </p>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 0 }}>
          <Spinner pad={80} />
        </div>
      ) : error ? (
        <div
          className="card"
          role="alert"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <span style={{ fontSize: 13, color: '#DC2626' }}>{error}</span>
          <button className="btn bs bsm" onClick={() => setRetryKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <FigureChecklist
            key={lines.length}
            lines={lines}
            suggestedCount={suggestedCount}
            busy={binding}
            onSaveSelection={handleSaveSelection}
          />
        </>
      )}

      {/* Footer — Back (left) · review status (center) · Continue (right). */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 18 }}>
        <button className="btn bs" onClick={() => navigate('/earnings/setup')}>
          ← Back
        </button>
        <span style={{ fontSize: 12, color: MUTED }}>
          {lines.length > 0 ? `${lines.length} lines available` : ''}
        </span>
        <button className="btn bp" onClick={handleContinue} disabled={loading || !!error}>
          Continue →
        </button>
      </div>

    </div>
  );
}
