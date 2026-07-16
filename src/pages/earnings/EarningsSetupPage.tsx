import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { earnings, ApiError } from '@/lib/api';
import type { EarningsVariant, EarningsQuarter, ReportTone } from '@/types/earnings';
import { canContinue } from './helpers';
import { ReportTypeToggle } from '@/components/earnings/ReportTypeToggle';
import { PeriodSelector } from '@/components/earnings/PeriodSelector';
import { ToneSelector } from '@/components/earnings/ToneSelector';
import { DEFAULT_EARNINGS_TONE } from '@/components/earnings/tones';
import { SourcePicker } from '@/components/earnings/SourcePicker';
import { INK, MUTED, ACCENT } from '@/components/earnings/tokens';

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

  const [variant, setVariant] = useState<EarningsVariant | null>(null);
  const [fiscalYear, setFiscalYear] = useState<number | null>(null);
  const [quarter, setQuarter] = useState<EarningsQuarter | null>(null);
  const [tone, setTone] = useState<ReportTone>(DEFAULT_EARNINGS_TONE);
  const [sourceIds, setSourceIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ message: string; reportId: string | null } | null>(null);

  const ready =
    !!companyId &&
    canContinue({ variant, fiscalYear, quarter, tone, sourceIds });

  const handleVariant = (v: EarningsVariant) => {
    setVariant(v);
    if (v === 'annual') setQuarter(null);
  };

  const handleContinue = async () => {
    if (!ready || !companyId || !variant || fiscalYear == null) return;
    setSubmitting(true);
    setError(null);
    setConflict(null);
    try {
      const res = await earnings.createEarningsReport({
        company_id: companyId,
        variant,
        fiscal_year: fiscalYear,
        quarter: variant === 'quarterly' ? quarter : null,
        tone,
        source_report_ids: sourceIds,
      });
      navigate(`/earnings/${res.report_id}/extract`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(readConflict(err));
      } else {
        setError(err instanceof Error ? err.message : 'Could not create the earnings report.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 4px' }}>
          Set up your earnings report
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
          Choose the report type, period, tone, and the sources it draws from.
        </p>
      </div>

      <div className="card" style={{ padding: '20px 22px' }}>
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
              onSelectedIdsChange={setSourceIds}
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
                onClick={() => navigate(`/earnings/${conflict.reportId}/extract`)}
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
            disabled={!ready || submitting}
            onClick={handleContinue}
            style={{
              padding: '11px 24px',
              fontSize: 13,
              fontWeight: 700,
              opacity: !ready || submitting ? 0.55 : 1,
              cursor: !ready || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Creating…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
