// Screen 3 of the Compliance Validation wizard — the publication gate.
// Blocked while HARD checks fail; otherwise the run can be certified.

import { useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { ComplianceStepper } from './ComplianceStepper';
import {
  certifiability,
  ComplianceHeader,
  ComplianceNotice,
  DARK,
  GREEN,
  isTerminalStatus,
  MONO,
  MUTED,
  RED,
  setupHref,
  useCertifyRun,
  useComplianceRun,
  useRememberScreen,
} from './compliance-ui';

export default function ComplianceGatePage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { run, loading, error, setRun, reload } = useComplianceRun(runId);

  // Someone who left mid-certification should come back to the gate, not to
  // the review screen behind it.
  useRememberScreen(runId, 'gate');

  // Patch the loaded run so the screen flips to its certified face without a
  // refetch. Who signed it off is held by the hook, not the run — GET /runs/{id}
  // doesn't carry `certified_by`.
  const onCertified = useCallback(
    () => setRun((prev) => (prev ? { ...prev, certified: true } : prev)),
    [setRun],
  );
  const onStale = useCallback(() => reload(), [reload]);
  const {
    certify,
    certifying,
    error: certifyError,
    blockedBy,
    certifiedBy,
  } = useCertifyRun(runId, { onCertified, onStale });

  // Nothing on this screen is meaningful until the run finishes — the gate is
  // null and the gaps list is empty for the whole 30–60s it takes. Send an
  // unfinished run back to the screen that waits for it.
  const inFlight = run != null && !isTerminalStatus(run.status);
  useEffect(() => {
    if (inFlight && runId) {
      navigate(`/compliance/runs/${runId}/running`, { replace: true });
    }
  }, [inFlight, runId, navigate]);

  // Only unresolved HARD gaps hold the gate shut.
  const blockers = (run?.gaps ?? []).filter((g) => g.gate === 'HARD' && !g.resolved);
  const { runDone, blocked, undecided, nothingVerified, canCertify } = certifiability(run);

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
              onClick={() => navigate(setupHref(run))}
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
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn bp"
                      onClick={() => navigate(`/compliance/runs/${run.run_id}/certificate`)}
                      style={{ fontSize: 12.5, padding: '9px 18px' }}
                    >
                      View certificate →
                    </button>
                  </div>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn bs"
              onClick={() => navigate(`/compliance/runs/${run.run_id}`)}
              style={{ fontSize: 13, padding: '9px 18px' }}
            >
              ← Back to results
            </button>
            {/* The certificate serves any FINISHED run, not just a certified
                one — it titles itself as a plain validation report when the run
                isn't cleared, so a user can take the detail away with them
                while they're still working through gaps. Offered here for the
                blocked and uncertified cases; the certified box has its own,
                louder button. */}
            {runDone && !run.certified && (
              <button
                type="button"
                className="btn bs"
                onClick={() => navigate(`/compliance/runs/${run.run_id}/certificate`)}
                style={{ fontSize: 13, padding: '9px 18px' }}
              >
                View validation report
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
