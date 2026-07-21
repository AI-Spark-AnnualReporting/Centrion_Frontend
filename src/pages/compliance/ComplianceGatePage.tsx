// Screen 3 of the Compliance Validation wizard — the publication gate.
// Blocked while HARD checks fail; otherwise the run can be certified.

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { ApiError, complianceValidation } from '@/lib/api';
import type { CertifyBlockedBody } from '@/types/compliance';
import { ComplianceStepper } from './ComplianceStepper';
import {
  ComplianceHeader,
  ComplianceNotice,
  DARK,
  GREEN,
  MONO,
  MUTED,
  RED,
  useComplianceRun,
} from './compliance-ui';

// The 409 body arrives as `{ detail: { message, reason?, blocking_rule_ids } }`,
// though FastAPI sometimes returns the payload unwrapped — read both shapes.
// `blocking_rule_ids` is normalised to an array because its emptiness is what
// distinguishes Case A (real failures) from Case B (nothing verified).
function readBlockedBody(err: unknown): CertifyBlockedBody | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const raw = err.body as
    | ({ detail?: CertifyBlockedBody } & Partial<CertifyBlockedBody>)
    | undefined;
  const body = raw?.detail ?? (raw as CertifyBlockedBody | undefined);
  if (!body || (!body.message && !body.reason)) return null;
  return {
    ...body,
    blocking_rule_ids: Array.isArray(body.blocking_rule_ids) ? body.blocking_rule_ids : [],
  };
}

export default function ComplianceGatePage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { run, loading, error, setRun, reload } = useComplianceRun(runId);

  const [certifying, setCertifying] = useState(false);
  const [certifyError, setCertifyError] = useState('');
  const [blockedBy, setBlockedBy] = useState<string[]>([]);
  const [certifiedBy, setCertifiedBy] = useState('');

  const certify = () => {
    if (!run) return;
    setCertifying(true);
    setCertifyError('');
    setBlockedBy([]);
    complianceValidation
      .certify(run.run_id)
      .then((res) => {
        setCertifiedBy(res.certified_by);
        setRun((prev) => (prev ? { ...prev, certified: res.certified } : prev));
      })
      .catch((e) => {
        const body = readBlockedBody(e);
        if (body) {
          if (body.blocking_rule_ids.length > 0) {
            // Case A — real HARD failures. The gate is re-checked server-side,
            // so this can fire even when the state we loaded said `open`;
            // refresh so the screen stops claiming the report is ready.
            setBlockedBy(body.blocking_rule_ids);
            setCertifyError(body.message);
            reload();
          } else {
            // Case B — nothing was verified. There is nothing to fix and no
            // rows to point at, so show the reason and no rule list.
            setCertifyError(body.reason || body.message);
          }
          return;
        }
        setCertifyError(e instanceof Error ? e.message : 'Failed to certify this report.');
      })
      .finally(() => setCertifying(false));
  };

  // Only unresolved HARD gaps hold the gate shut.
  const blockers = (run?.gaps ?? []).filter((g) => g.gate === 'HARD' && !g.resolved);
  const blocked = run?.publication_gate === 'blocked';
  // A null readiness means every applicable rule returned no_data — nothing was
  // actually verified, so certify would 409 (Case B). Predict it here rather
  // than letting the user click into an error.
  const nothingVerified = run != null && run.overall_readiness == null;
  const canCertify = run != null && !blocked && !nothingVerified;

  return (
    <div>
      <ComplianceHeader />
      <ComplianceStepper activeStep={3} />

      {loading ? (
        <Spinner pad={48} />
      ) : error || !run ? (
        <ComplianceNotice
          title="Couldn't load this validation run"
          detail={error || 'The run may have expired, or the compliance service is unavailable.'}
          tone="error"
          action={
            <button
              type="button"
              className="btn bs"
              onClick={() => navigate('/compliance')}
              style={{ fontSize: 12.5, padding: '8px 16px' }}
            >
              ← Back to set up
            </button>
          }
        />
      ) : (
        <>
          {blocked ? (
            <div className="card" style={{ padding: 22, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22, color: RED, lineHeight: 1 }}>⊘</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: RED }}>
                  Publication blocked
                </span>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#5A6080', lineHeight: 1.65 }}>
                {blockers.length} hard-gate {blockers.length === 1 ? 'check is' : 'checks are'}{' '}
                still failing. Resolve them on the results screen, then return here to certify.
              </p>

              {blockers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                  {blockers.map((g) => (
                    <div
                      key={g.result_id}
                      style={{
                        padding: '11px 13px',
                        borderRadius: 10,
                        background: 'rgba(239,68,68,.05)',
                        border: '1px solid rgba(239,68,68,.2)',
                      }}
                    >
                      <div style={{ fontSize: 11.5, fontFamily: MONO, color: RED }}>
                        {g.regulator} · {g.rule_id}
                      </div>
                      <div style={{ fontSize: 12.5, color: DARK, marginTop: 4, lineHeight: 1.55 }}>
                        {g.finding}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="btn bp"
                  onClick={() => navigate(`/compliance/runs/${run.run_id}`)}
                  style={{ fontSize: 13, padding: '10px 20px' }}
                >
                  Go resolve gaps
                </button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 22, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{ fontSize: 20, color: nothingVerified ? MUTED : GREEN, lineHeight: 1 }}
                >
                  {nothingVerified ? '◦' : '✓'}
                </span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: nothingVerified ? MUTED : GREEN,
                  }}
                >
                  {nothingVerified ? 'Nothing to certify' : 'Ready to publish'}
                </span>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#5A6080', lineHeight: 1.65 }}>
                {nothingVerified
                  ? 'Every applicable rule returned “no data” — no evidence source is wired for them yet, so nothing was actually verified. There is nothing to fix here; this will resolve as extractors are added.'
                  : 'No hard-gate check is failing. Certifying records this report as validated against its enabled frameworks.'}
              </p>

              {run.certified ? (
                <div
                  style={{
                    marginTop: 18,
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(34,197,94,.08)',
                    border: '1px solid rgba(34,197,94,.25)',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: GREEN }}>✓ Certified</div>
                  {certifiedBy && (
                    <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4, fontFamily: MONO }}>
                      by {certifiedBy}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 18 }}>
                  <button
                    type="button"
                    className="btn bp"
                    onClick={certify}
                    disabled={certifying || !canCertify}
                    style={{
                      fontSize: 13,
                      padding: '10px 22px',
                      opacity: certifying || !canCertify ? 0.5 : 1,
                      cursor: canCertify && !certifying ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {certifying
                      ? 'Certifying…'
                      : nothingVerified
                        ? 'Nothing to certify — awaiting data'
                        : 'Certify'}
                  </button>
                </div>
              )}

              {certifyError && (
                <div
                  style={{
                    marginTop: 14,
                    fontSize: 12,
                    lineHeight: 1.6,
                    // Case B isn't an error the user caused, so it reads muted
                    // rather than red.
                    color: blockedBy.length > 0 ? RED : MUTED,
                  }}
                >
                  {certifyError}
                  {blockedBy.length > 0 && (
                    <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 11.5 }}>
                      {blockedBy.join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <button
              type="button"
              className="btn bs"
              onClick={() => navigate(`/compliance/runs/${run.run_id}`)}
              style={{ fontSize: 13, padding: '9px 18px' }}
            >
              ← Back to results
            </button>
          </div>
        </>
      )}
    </div>
  );
}
