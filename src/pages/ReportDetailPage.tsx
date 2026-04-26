import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { reports as reportsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { GeneratingScreen } from '@/components/reports/GeneratingScreen';
import { ReportDetailView } from '@/components/reports/ReportDetailView';
import type { CoverageResponse } from '@/types/report';

interface ReportDetailLocationState {
  coverage?: CoverageResponse;
}

export default function ReportDetailPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  // If we navigated here from the generate flow, coverage may already be in
  // location.state — render immediately without re-fetching.
  const handoffCoverage =
    (location.state as ReportDetailLocationState | null)?.coverage ?? null;

  const [coverage, setCoverage] = useState<CoverageResponse | null>(handoffCoverage);
  const [loading, setLoading] = useState<boolean>(!handoffCoverage);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (handoffCoverage) return;
    if (!companyId || !reportId) {
      setError('Missing company or report identifier.');
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    reportsApi
      .getCoverage<CoverageResponse>(companyId, reportId)
      .then((cov) => {
        if (requestId !== requestIdRef.current) return;
        setCoverage(cov);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Failed to load report.');
      });
  }, [companyId, reportId, handoffCoverage]);

  if (loading) {
    return (
      <GeneratingScreen
        phase="running"
        onCancel={() => navigate('/reports', { replace: true })}
      />
    );
  }

  if (error || !coverage) {
    return (
      <GeneratingScreen
        phase="failed"
        errorMessage={error ?? 'Coverage data is unavailable.'}
        onCancel={() => navigate('/reports', { replace: true })}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => navigate('/reports')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            color: '#4040C8',
            background: 'rgba(64,64,200,.06)',
            border: '1px solid rgba(64,64,200,.25)',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 2.5l-3 3.5 3 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to reports
        </button>
      </div>
      <ReportDetailView coverage={coverage} />
    </div>
  );
}
