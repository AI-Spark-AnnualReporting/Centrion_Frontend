import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { earnings } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import type { EarningsFigure, EarningsFigureSource } from '@/types/earnings';
import { needsReviewCount } from './helpers';
import { SelectedSourcesHeader } from '@/components/earnings/SelectedSourcesHeader';
import { FigureTable } from '@/components/earnings/FigureTable';
import { EarningsStepper } from '@/components/earnings/EarningsStepper';
import { INK, MUTED } from '@/components/earnings/tokens';

export default function EarningsExtractPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  // companyId isn't needed by the figures endpoints (report-scoped), but we read
  // it defensively so a null user never crashes the page.
  void (user?.company_id ?? null);

  const [figures, setFigures] = useState<EarningsFigure[]>([]);
  const [sources, setSources] = useState<EarningsFigureSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Load the reviewed figure set. The FIRST load triggers the backend resolve.
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
      .getEarningsFigures(reportId)
      .then((res) => {
        if (cancelled) return;
        setFigures(res.figures);
        setSources(res.sources);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load figures.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, retryKey]);

  // Optimistic single-figure edit with rollback on failure. Rethrows so the
  // editing cell surfaces the error.
  const handleSaveValue = useCallback(
    async (figureId: string, value: number) => {
      if (!reportId) return;
      const prev = figures.find((f) => f.id === figureId) ?? null;
      // optimistic: apply the value, mark manual (clears the flag).
      setFigures((list) =>
        list.map((f) =>
          f.id === figureId ? { ...f, value, edited: true, confidence: null, flag: null } : f,
        ),
      );
      try {
        const updated = await earnings.patchEarningsFigure(reportId, figureId, {
          value,
          unit: prev?.unit ?? undefined,
        });
        setFigures((list) => list.map((f) => (f.id === figureId ? { ...updated, edited: true } : f)));
      } catch (err) {
        // rollback
        setFigures((list) => list.map((f) => (f.id === figureId && prev ? prev : f)));
        throw err;
      }
    },
    [reportId, figures],
  );

  const reviewCount = needsReviewCount(figures);

  const goOutline = () => navigate(`/earnings/${reportId}/outline`);
  const handleContinue = () => {
    if (reviewCount > 0) setConfirmOpen(true);
    else goOutline();
  };

  return (
    <div>
      <EarningsStepper activeStep={2} reportId={reportId} />
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 4px' }}>
          Extract earnings data
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
          Review the figures pulled from your sources. Correct anything flagged, then continue.
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
          <SelectedSourcesHeader sources={sources} />
          {figures.length === 0 ? (
            <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
              No figures found for this period from the selected sources.
            </div>
          ) : (
            <FigureTable figures={figures} onSaveValue={handleSaveValue} />
          )}
        </>
      )}

      {/* Footer — Back (left) · review status (center) · Continue (right). */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 18 }}>
        <button className="btn bs" onClick={() => navigate('/earnings/setup')}>
          ← Back
        </button>
        <span style={{ fontSize: 12, color: reviewCount > 0 ? '#B4730B' : MUTED, fontWeight: reviewCount > 0 ? 700 : 400 }}>
          {reviewCount > 0
            ? `${reviewCount} figure${reviewCount === 1 ? '' : 's'} need${reviewCount === 1 ? 's' : ''} review`
            : 'All figures reviewed'}
        </span>
        <button className="btn bp" onClick={handleContinue} disabled={loading || !!error}>
          Continue →
        </button>
      </div>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: 'rgba(20,22,40,.45)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(420px, 100%)', background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 60px rgba(20,22,40,.24)' }}
          >
            <div style={{ padding: '18px 20px 6px' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: INK, marginBottom: 6 }}>
                Continue with figures needing review?
              </div>
              <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                {reviewCount} figure{reviewCount === 1 ? ' needs' : 's need'} review before this report
                is finalized. You can continue anyway, or go back and correct{' '}
                {reviewCount === 1 ? 'it' : 'them'} first.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px 18px' }}>
              <button className="btn bs" onClick={() => setConfirmOpen(false)}>
                Keep reviewing
              </button>
              <button className="btn bp" onClick={goOutline}>
                Continue anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
