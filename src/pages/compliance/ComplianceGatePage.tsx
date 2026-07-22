// Screen 3 of the Compliance Validation wizard — the publication gate.
// Blocked while HARD checks fail; otherwise the run can be certified.

import { useEffect, useState } from 'react';
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
  isRunDone,
  isTerminalStatus,
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

  // Nothing on this screen is meaningful until the run finishes — the gate is
  // null and the gaps list is empty for the whole 30–60s it takes. Send an
  // unfinished run back to the screen that waits for it.
  const inFlight = run != null && !isTerminalStatus(run.status);
  useEffect(() => {
    if (inFlight && runId) {
      navigate(`/compliance/runs/${runId}/running`, { replace: true });
    }
  }, [inFlight, runId, navigate]);

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
          // Case A — the run hasn't finished. Not a failure and not the user's
          // doing; the gate simply isn't decided yet. Reload so the screen picks
          // up the real state (and bounces to the progress screen if it's still
          // going) rather than leaving a red error under the button.
          if (body.status === 'running') {
            setCertifyError(
              'This validation is still running — it needs to finish before the report can be certified.',
            );
            reload();
            return;
          }
          if (body.blocking_rule_ids.length > 0) {
            // Case B — real HARD failures. The gate is re-checked server-side,
            // so this can fire even when the state we loaded said `open`;
            // refresh so the screen stops claiming the report is ready.
            setBlockedBy(body.blocking_rule_ids);
            setCertifyError(body.message);
            reload();
          } else {
            // Case C — nothing was verified. There is nothing to fix and no
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
  // Null is its own case, not a synonym for `open`: the gate wasn't decided.
  // Certifying against an undecided gate is exactly what the 409 exists to stop.
  const undecided = run != null && run.publication_gate == null;
  // Null readiness means nothing was actually verified, so certify would 409.
  // Predict it here rather than letting the user click into an error.
  const nothingVerified = run != null && run.overall_readiness == null;
  // Certify 409s on a run that isn't finished, so the button stays disabled
  // until the run reports `done` — the poll screen normally gets there first,
  // but this is the guard that makes it true regardless of how the user arrived.
  const runDone = isRunDone(run?.status);
  const canCertify = run != null && runDone && !blocked && !undecided && !nothingVerified;

  return (
    <div>
      <ComplianceHeader />
      <ComplianceStepper activeStep={3} />

      {loading || inFlight ? (
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
              {/* Three outcomes reach this branch, and only one of them is
                  "green". `undecided` in particular must not read as ready —
                  a null gate means no verdict, not a passing one. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20, color: canCertify ? GREEN : MUTED, lineHeight: 1 }}>
                  {canCertify ? '✓' : '◦'}
                </span>
                <span
                  style={{ fontSize: 15, fontWeight: 800, color: canCertify ? GREEN : MUTED }}
                >
                  {canCertify
                    ? 'Ready to publish'
                    : undecided
                      ? 'No publication verdict'
                      : 'Nothing to certify'}
                </span>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#5A6080', lineHeight: 1.65 }}>
                {canCertify
                  ? 'No hard-gate check is failing. Certifying records this report as validated against its enabled frameworks.'
                  : undecided
                    ? 'This run didn’t reach a publication verdict, so there is no gate to certify against. Run the validation again to get one.'
                    : 'Nothing in this run was scoreable — every applicable rule was either outside this company’s scope or answered by a filing or register outside this report. There is nothing to certify against.'}
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
                      : !runDone
                        ? 'Waiting for the validation to finish'
                        : undecided
                          ? 'No verdict to certify'
                          : nothingVerified
                            ? 'Nothing to certify'
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
