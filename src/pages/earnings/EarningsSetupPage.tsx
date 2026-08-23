import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useFeaturePermissions } from '@/lib/features';
import { earnings, ApiError } from '@/lib/api';
import type { EarningsVariant, EarningsQuarter, ReportTone, EarningsReportSummary } from '@/types/earnings';
import { canContinue } from './helpers';
import { ReportTypeToggle } from '@/components/earnings/ReportTypeToggle';
import { PeriodSelector } from '@/components/earnings/PeriodSelector';
import { ToneSelector } from '@/components/earnings/ToneSelector';
import { DEFAULT_EARNINGS_TONE } from '@/components/earnings/tones';
import { SourcePicker } from '@/components/earnings/SourcePicker';
import { EarningsReportCard } from '@/components/earnings/EarningsReportCard';
import { Spinner } from '@/components/shared/Spinner';
import { INK, MUTED, ACCENT, FAINT } from '@/components/earnings/tokens';

// One numbered block in the setup form.
function Block({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 8,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 800,
            color: ACCENT,
            background: '#EEEEFF',
          }}
        >
          {n}
        </span>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: INK }}>{title}</h2>
      </div>
      <div style={{ marginLeft: 34 }}>{children}</div>
    </section>
  );
}

// Read a report id out of a FastAPI 409 body (shape unknown → read defensively).
function readConflict(err: ApiError): { message: string; reportId: string | null } {
  const body = (err.body ?? {}) as Record<string, unknown>;
  const detail = body.detail;
  const detailObj =
    detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : {};
  const pick = (o: Record<string, unknown>, ...keys: string[]): string | null => {
    for (const k of keys) if (typeof o[k] === 'string' && o[k]) return o[k] as string;
    return null;
  };
  const reportId =
    pick(detailObj, 'report_id', 'existing_report_id', 'id') ??
    pick(body, 'report_id', 'existing_report_id', 'id');
  const message =
    (typeof detail === 'string' ? detail : pick(detailObj, 'message')) ??
    'An active earnings report already exists for this period.';
  return { message, reportId };
}

export default function EarningsSetupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const { canCreate, canRead } = useFeaturePermissions('earnings_report');

  const [variant, setVariant] = useState<EarningsVariant | null>(null);
  const [fiscalYear, setFiscalYear] = useState<number | null>(null);
  const [quarter, setQuarter] = useState<EarningsQuarter | null>(null);
  const [tone, setTone] = useState<ReportTone>(DEFAULT_EARNINGS_TONE);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [sourceSplit, setSourceSplit] = useState<{ source_report_ids: string[]; source_document_ids: string[] }>({
    source_report_ids: [],
    source_document_ids: [],
  });

  const [formOpen, setFormOpen] = useState(true);
  // idle → creating (ensureDraft) → uploading (uploadEarningsSources) — drives
  // the Continue button's label so upload+classify+extract is never a silent
  // hang (D-19).
  const [continueStage, setContinueStage] = useState<'idle' | 'creating' | 'uploading'>('idle');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ message: string; reportId: string | null } | null>(null);

  // The draft created for THIS setup session. Uploads are report-scoped (D-22),
  // so the draft must exist before uploading — we create it once and reuse the
  // same report_id for both the upload route and Continue (never a second draft).
  const [sessionReportId, setSessionReportId] = useState<string | null>(null);
  const createInFlightRef = useRef<Promise<string> | null>(null);

  // Create the draft once, then reuse. `createInFlightRef` collapses concurrent
  // callers (e.g. a fast double-click) onto a single POST /earnings/reports.
  const ensureDraft = useCallback(
    async (srcReports: string[], srcDocs: string[]): Promise<string> => {
      if (sessionReportId) return sessionReportId;
      if (createInFlightRef.current) return createInFlightRef.current;
      if (!companyId || !variant || fiscalYear == null) {
        throw new Error('Choose the report type and period first.');
      }
      const p = earnings
        .createEarningsReport({
          company_id: companyId,
          variant,
          fiscal_year: fiscalYear,
          quarter: variant === 'quarterly' ? quarter : null,
          tone,
          source_report_ids: srcReports,
          source_document_ids: srcDocs,
        })
        .then((res) => {
          setSessionReportId(res.report_id);
          createInFlightRef.current = null;
          return res.report_id;
        })
        .catch((err) => {
          createInFlightRef.current = null;
          throw err;
        });
      createInFlightRef.current = p;
      return p;
    },
    [sessionReportId, companyId, variant, fiscalYear, quarter, tone],
  );

  // Dashboard: this company's existing earnings reports (newest first).
  const [reports, setReports] = useState<EarningsReportSummary[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !canRead) {
      setReports([]);
      setReportsLoading(false);
      return;
    }
    let cancelled = false;
    setReportsLoading(true);
    setReportsError(null);
    earnings
      .listEarningsReports(companyId)
      .then((res) => {
        if (!cancelled) setReports(res.reports);
      })
      .catch((err: unknown) => {
        if (!cancelled) setReportsError(err instanceof Error ? err.message : 'Failed to load your reports.');
      })
      .finally(() => {
        if (!cancelled) setReportsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, canRead]);

  // A draft already created this session (via upload) is enough to Continue —
  // its uploaded sources are attached server-side even while they extract. A
  // staged-but-not-yet-uploaded file also counts (Continue uploads it as part
  // of the same action, never a separate button).
  const ready =
    !!sessionReportId ||
    (!!companyId &&
      canContinue({ variant, fiscalYear, quarter, tone, sourceIds, pendingUploadCount: uploadFiles.length }));

  const handleVariant = (v: EarningsVariant) => {
    setVariant(v);
    if (v === 'annual') setQuarter(null);
  };

  const handleContinue = async () => {
    if (continueStage !== 'idle') return;
    if (!ready || !companyId || !variant || fiscalYear == null) return;
    setError(null);
    setConflict(null);
    try {
      // ensureDraft reuses sessionReportId when one already exists — never a
      // second draft, including on a retry after a failed upload below.
      setContinueStage('creating');
      const reportId = await ensureDraft(sourceSplit.source_report_ids, sourceSplit.source_document_ids);
      if (uploadFiles.length > 0) {
        setContinueStage('uploading');
        await earnings.uploadEarningsSources(reportId, uploadFiles);
        setUploadFiles([]);
      }
      navigate(`/earnings/${reportId}/outline`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(readConflict(err));
      } else {
        setError(err instanceof Error ? err.message : 'Could not create the earnings report.');
      }
      // uploadFiles is deliberately NOT cleared here — a failed upload after a
      // successful draft-create must stay retryable without re-staging files.
    } finally {
      setContinueStage('idle');
    }
  };

  return (
    <div>
      {canCreate && (
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 4px' }}>
          Set up your earnings report
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
          Choose the report type, period, tone, and the sources it draws from.
        </p>
      </div>
      )}

      {canCreate && (
      <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        {/* Collapsible header — matches the Quarterly "Generate Report" card. */}
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            cursor: 'pointer',
            borderBottom: formOpen ? '1px solid #ECEEF8' : 'none',
          }}
          onClick={() => setFormOpen(!formOpen)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: ACCENT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1l1.1 3.3H11L8.5 6.4l1.1 3.3L6 7.8l-3.6 2 1.1-3.3L1 4.3h3.9z" fill="white" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: INK }}>Generate Earnings Report</div>
              <div style={{ fontSize: 11, color: MUTED }}>Configure parameters &amp; select source documents</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>AI Powered</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              style={{ transform: formOpen ? 'rotate(180deg)' : 'rotate(0)', transition: '.2s' }}
            >
              <path d="M3 5l4 4 4-4" stroke="#5A6080" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {formOpen && (
        <div style={{ padding: '18px 20px' }}>
        <Block n={1} title="Report type">
          <ReportTypeToggle value={variant} onChange={handleVariant} />
        </Block>

        {variant && (
          <Block n={2} title="Reporting period">
            <PeriodSelector
              variant={variant}
              fiscalYear={fiscalYear}
              quarter={quarter}
              onYearChange={setFiscalYear}
              onQuarterChange={setQuarter}
            />
          </Block>
        )}

        <Block n={3} title="Report tone">
          <ToneSelector value={tone} onChange={setTone} />
        </Block>

        <Block n={4} title="Sources">
          {variant ? (
            <SourcePicker
              companyId={companyId}
              variant={variant}
              fiscalYear={fiscalYear}
              quarter={quarter}
              selectedIds={sourceIds}
              onSelectedIdsChange={(ids, split) => {
                setSourceIds(ids);
                setSourceSplit(split);
              }}
              uploadFiles={uploadFiles}
              onUploadFilesChange={setUploadFiles}
            />
          ) : (
            <div style={{ fontSize: 12, color: '#9BA3C4' }}>
              Choose a report type and period first.
            </div>
          )}
        </Block>

        {conflict && (
          <div
            role="alert"
            style={{
              marginBottom: 14,
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(245,158,11,.08)',
              border: '1px solid rgba(245,158,11,.3)',
              color: '#B4730B',
              fontSize: 12.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span>{conflict.message}</span>
            {conflict.reportId && (
              <button
                type="button"
                className="btn bs bsm"
                onClick={() => navigate(`/earnings/${conflict.reportId}/outline`)}
              >
                Open existing draft
              </button>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 14,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(229,72,77,.08)',
              border: '1px solid rgba(229,72,77,.25)',
              color: '#B33A3E',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            type="button"
            className="btn bp"
            disabled={!ready || continueStage !== 'idle'}
            onClick={handleContinue}
            style={{
              padding: '11px 24px',
              fontSize: 13,
              fontWeight: 700,
              opacity: !ready || continueStage !== 'idle' ? 0.55 : 1,
              cursor: !ready || continueStage !== 'idle' ? 'not-allowed' : 'pointer',
            }}
          >
            {continueStage === 'creating'
              ? 'Creating…'
              : continueStage === 'uploading'
              ? 'Uploading and reading your documents…'
              : 'Continue'}
          </button>
        </div>
        </div>
        )}
      </div>
      )}

      {/* Your earnings reports — dashboard tiles. Each opens the preview screen.
          Hidden entirely once we know there are none — no empty-state card. */}
      {canRead && (reportsLoading || reportsError || reports.length > 0) && (
      <div style={{ marginTop: 28 }}>
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: 0 }}>Your earnings reports</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: MUTED }}>
            Open an existing report to preview, edit, export, or approve it.
          </p>
        </div>

        {reportsLoading ? (
          <Spinner pad={40} />
        ) : reportsError ? (
          <div className="card" role="alert" style={{ padding: '14px 18px', fontSize: 12.5, color: '#DC2626' }}>
            {reportsError}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {reports.map((r) => (
              <EarningsReportCard
                key={r.report_id}
                report={r}
                onOpen={(rep) => navigate(`/earnings/${rep.report_id}/preview`)}
              />
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
