// Screen 2 of the Compliance Validation wizard — readiness score, per-framework
// scores, the gaps table, and the rule-level trace accordion.
//
// Three rules drive most of the styling here:
//   · `no_data` is not a failure. It means the rule is answered by a filing or
//     register outside this report — grey, never red, never scored.
//   · A null score means nothing was scoreable, not zero.
//   · A null publication gate means the gate hasn't been decided, which is NOT
//     the same as "open". It gets its own branch everywhere it's rendered.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { complianceValidation } from '@/lib/api';
import type {
  ComplianceRun,
  FrameworkScore,
  Gap,
  RuleDetailGroup,
} from '@/types/compliance';
import { ComplianceStepper } from './ComplianceStepper';
import { ResolveGapDialog } from './ResolveGapDialog';
import {
  AMBER,
  ComplianceHeader,
  ComplianceNotice,
  ConfidenceMark,
  DARK,
  EvidenceProof,
  EvidenceQuote,
  GapEvidenceBlock,
  GateChip,
  groupCounts,
  isPartiallyEvidenced,
  isRunDone,
  isTerminalStatus,
  MONO,
  MUTED,
  PRIMARY,
  RED,
  safeScore,
  scoreColor,
  SeverityChip,
  setupHref,
  useRememberScreen,
  StatusIcon,
  statusHint,
  statusLabel,
  useComplianceRun,
} from './compliance-ui';

// ── top band ─────────────────────────────────────────────────────────────────

// The gate banner. `publication_gate` is null until the run finishes, so this
// branches on all three values explicitly — an `open ? green : red` shape would
// render a null gate as "Ready to publish", which is exactly the wrong thing to
// tell someone about a report nobody has checked yet.
function GateBanner({ gate, hardFailing }: { gate: ComplianceRun['publication_gate']; hardFailing: number }) {
  const style = (bg: string, border: string, color: string) => ({
    marginTop: 16,
    padding: '11px 14px',
    borderRadius: 10,
    background: bg,
    border: `1px solid ${border}`,
    fontSize: 12.5,
    fontWeight: 700,
    color,
  });

  if (gate === 'blocked') {
    return (
      <div style={style('rgba(239,68,68,.08)', 'rgba(239,68,68,.25)', RED)}>
        ⊘ Publication blocked — {hardFailing} HARD{' '}
        {hardFailing === 1 ? 'check is' : 'checks are'} failing.
      </div>
    );
  }
  if (gate === 'open') {
    return (
      <div style={style('rgba(34,197,94,.08)', 'rgba(34,197,94,.25)', '#16A34A')}>
        ✓ Ready to publish — no HARD checks are failing.
      </div>
    );
  }
  return (
    <div style={style('#F4F5FB', '#E2E4F0', MUTED)}>
      ◦ Publication gate not decided — this run didn’t reach a verdict.
    </div>
  );
}

function ReadinessBand({ run }: { run: ComplianceRun }) {
  const score = safeScore(run.overall_readiness);
  const hardFailing = run.gaps.filter((g) => g.gate === 'HARD' && !g.resolved).length;
  // Rules answered somewhere other than this report. A handful, not a wall.
  const outsideReport = run.frameworks.reduce((n, f) => n + (f.no_data ?? 0), 0);

  return (
    <div className="card" style={{ padding: 20, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: '.4px' }}>
            SUBMISSION READINESS
          </div>
          {score == null ? (
            <div style={{ fontSize: 22, fontWeight: 800, color: MUTED, marginTop: 6 }}>
              Not scored
            </div>
          ) : (
            <div
              style={{
                fontSize: 38,
                fontWeight: 800,
                fontFamily: MONO,
                lineHeight: 1.1,
                color: scoreColor(score),
              }}
            >
              {score}
              <span style={{ fontSize: 18, color: MUTED }}>/100</span>
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        {outsideReport > 0 && (
          <div
            style={{ fontSize: 12, color: MUTED, fontFamily: MONO }}
            title="Answered by a filing or register outside this report."
          >
            {outsideReport} not in this report
          </div>
        )}
      </div>

      {score == null && (
        <div style={{ marginTop: 12, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          Nothing in this run was scoreable — every applicable rule was either outside this
          report’s scope or answered elsewhere.
        </div>
      )}

      <GateBanner gate={run.publication_gate} hardFailing={hardFailing} />
    </div>
  );
}

// Shown above everything on a certified run, so it's obvious before scrolling
// that this screen is a record of a sign-off rather than live working state.
// (GET /runs carries only the `certified` flag — the signer and timestamp live
// on GET /certified, which the gallery card already shows.)
function CertifiedBanner() {
  return (
    <div
      className="card"
      style={{
        padding: '14px 18px',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        background: 'linear-gradient(90deg, rgba(34,197,94,.08), rgba(34,197,94,.02))',
        border: '1px solid rgba(34,197,94,.28)',
      }}
    >
      <span style={{ fontSize: 18, color: '#16A34A', lineHeight: 1 }}>✓</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#16A34A' }}>
          Certified — view only
        </div>
        <div style={{ fontSize: 11.5, color: '#5A6080', marginTop: 2, lineHeight: 1.55 }}>
          This run has been signed off. Its results are kept exactly as they were at
          certification, so nothing here can be changed. Run a new validation to reassess the
          report.
        </div>
      </div>
    </div>
  );
}

// ── framework score cards ────────────────────────────────────────────────────

function FrameworkCard({ f }: { f: FrameworkScore }) {
  const score = safeScore(f.score);
  return (
    <div className="card" style={{ padding: 16, flex: '1 1 200px', minWidth: 190 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: DARK }}>{f.regulator}</div>

      {/* A null score is not a zero — nothing here was scoreable, so there is no
          percentage to show. Say that in words rather than rendering 0%. */}
      {score == null ? (
        <>
          <div
            style={{ fontSize: 14, fontWeight: 700, color: MUTED, marginTop: 14, lineHeight: 1 }}
          >
            Not scored
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
            {f.no_data > 0
              ? `${f.no_data} ${f.no_data === 1 ? 'rule is' : 'rules are'} answered outside this report`
              : 'Nothing here was scoreable'}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              fontFamily: MONO,
              lineHeight: 1,
              marginTop: 12,
              color: scoreColor(score),
            }}
          >
            {score}%
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
            {f.passed}/{f.total} passed
            {f.no_data > 0 && ` · ${f.no_data} not in this report`}
          </div>
        </>
      )}
    </div>
  );
}

// ── gaps table ───────────────────────────────────────────────────────────────

function GapsTable({
  gaps,
  onResolve,
  readOnly = false,
}: {
  gaps: Gap[];
  onResolve: (gap: Gap) => void;
  readOnly?: boolean;
}) {
  // The count is the work still outstanding, not the number of rows — resolving
  // one has to move it, or the header contradicts the row the user just cleared.
  // Resolved rows stay visible as a record of what was done.
  const outstanding = gaps.filter((g) => !g.resolved).length;
  const resolved = gaps.length - outstanding;

  return (
    <div className="card" style={{ marginBottom: 14, overflow: 'hidden' }}>
      <div className="uhead">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="uhead-title">Gaps &amp; recommendations</span>
          <span className="uhead-count">{outstanding}</span>
          {resolved > 0 && (
            <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 700 }}>
              · {resolved} resolved
            </span>
          )}
        </div>
      </div>

      {gaps.length === 0 ? (
        <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: MUTED }}>
          No gaps — no check came back as a failure.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="utable">
            <thead>
              <tr>
                <th>Framework</th>
                <th>Finding</th>
                <th>Severity</th>
                <th>Gate</th>
                <th>Evidence</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((g) => {
                // "Partially evidenced." means the author wrote something that
                // doesn't go far enough — a softer failure than a flat miss, so
                // it reads amber. It is still a fail: it stays in this list and
                // still holds a HARD gate shut.
                const partial = isPartiallyEvidenced(g.finding);
                return (
                  <tr
                    key={g.result_id}
                    className="urow"
                    // Settled work recedes so the outstanding rows read first.
                    style={g.resolved ? { opacity: 0.55 } : undefined}
                  >
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700 }}>{g.regulator}</div>
                      <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{g.rule_id}</div>
                    </td>
                    <td style={{ maxWidth: 320, lineHeight: 1.55 }}>
                      {partial && (
                        <span
                          className="badge b-am"
                          style={{ marginRight: 7, verticalAlign: 'middle' }}
                          title="Something was written, but not enough to satisfy the rule."
                        >
                          PARTIAL
                        </span>
                      )}
                      <span style={{ color: partial ? AMBER : undefined }}>{g.finding}</span>
                    </td>
                    <td>
                      <SeverityChip severity={g.severity} />
                    </td>
                    <td>
                      <GateChip gate={g.gate} />
                    </td>
                    <td style={{ maxWidth: 340 }}>
                      <GapEvidenceBlock gap={g} />
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {g.resolved ? (
                        <span className="badge b-gn">● Resolved</span>
                      ) : readOnly ? (
                        // Certified runs are a record, not a workspace — this
                        // gap's state is what it was at sign-off, permanently.
                        <span className="badge b-gy" title="Open when this run was certified">
                          Not resolved
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn bs"
                          onClick={() => onResolve(g)}
                          style={{ fontSize: 11.5, padding: '6px 12px' }}
                        >
                          Mark resolved
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── rule-level accordion ─────────────────────────────────────────────────────

function RuleAccordion({ detail }: { detail: RuleDetailGroup[] }) {
  // Hand-rolled collapse — no page in this app imports the shadcn accordion.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (detail.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 14, overflow: 'hidden' }}>
      <div className="ch">
        <div>
          <div className="ct">Rule-level detail</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
            Every check, with the sentence from your report it was decided on. Rules marked “not in
            this report” are answered by a filing or register elsewhere — they are not failures.
          </div>
        </div>
      </div>

      {detail.map((d) => {
        const isOpen = open.has(d.regulator);
        const c = groupCounts(d);
        return (
          <div key={d.regulator} style={{ borderTop: '1px solid #ECEEF8' }}>
            <button
              type="button"
              onClick={() => toggle(d.regulator)}
              aria-expanded={isOpen}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '13px 18px',
                background: isOpen ? '#FAFBFE' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  color: MUTED,
                  fontSize: 10,
                  transform: isOpen ? 'rotate(90deg)' : 'none',
                  transition: 'transform .15s',
                }}
              >
                ▶
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: DARK }}>{d.regulator}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>
                {c.scoreable > 0 ? `${c.passed}/${c.scoreable} pass` : 'nothing scoreable'}
                {c.noData > 0 && ` · ${c.noData} elsewhere`}
                {c.na > 0 && ` · ${c.na} n/a`}
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: '2px 18px 14px' }}>
                {d.rules.map((r) => (
                  <div key={r.rule_id} style={{ padding: '10px 0', borderTop: '1px solid #F4F5FB' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                      <StatusIcon status={r.status} />
                      <span style={{ fontSize: 11.5, fontFamily: MONO, color: PRIMARY }}>
                        {r.rule_id}
                      </span>
                      <span
                        title={statusHint(r.status)}
                        style={{
                          fontSize: 11,
                          color:
                            r.status === 'no_data' || r.status === 'na' ? MUTED : '#5A6080',
                          fontWeight: 600,
                        }}
                      >
                        {statusLabel(r.status)}
                      </span>
                      <ConfidenceMark evidence={r.evidence} />
                      <GateChip gate={r.gate} />
                    </div>

                    {/* The payoff of the rewrite: on a pass, the author sees the
                        sentence of their own report the checker accepted. */}
                    <div style={{ paddingLeft: 23 }}>
                      <EvidenceQuote evidence={r.evidence} compact />
                      <EvidenceProof evidence={r.evidence} />
                    </div>

                    {/* Only when there was no quote to hang it under — otherwise
                        the pull-quote already carries the source line. */}
                    {!r.evidence?.quote && (r.evidence?.evidence_source || r.evidence_source) && (
                      <div
                        style={{
                          marginTop: 5,
                          paddingLeft: 23,
                          fontSize: 11,
                          fontFamily: MONO,
                          color: '#5A6080',
                          lineHeight: 1.7,
                        }}
                      >
                        <span style={{ color: PRIMARY, fontWeight: 700 }}>source</span>{' '}
                        {r.evidence?.evidence_source ?? r.evidence_source}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function ComplianceReviewPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { run, loading, error, setRun, reload } = useComplianceRun(runId);

  // So "Continue" from the set-up shelf comes back to the results rather than
  // to the top of the wizard.
  useRememberScreen(runId, 'review');

  // A run reached by deep link or a refresh may not be finished — it takes
  // 30–60s. There is nothing to review until it is, and every list here would
  // be empty, so send it to the screen that knows how to wait.
  const inFlight = run != null && !isTerminalStatus(run.status);
  useEffect(() => {
    if (inFlight && runId) {
      navigate(`/compliance/runs/${runId}/running`, { replace: true });
    }
  }, [inFlight, runId, navigate]);

  const [target, setTarget] = useState<Gap | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The dialog won't call this without a non-blank reason — resolving a gap is
  // an audit event, so it never goes through unjustified.
  const confirmResolve = (reason: string) => {
    if (!target || !reason) return;
    setSaving(true);
    setSaveError(null);
    complianceValidation
      .resolveGap(target.result_id, reason)
      .then((res) => {
        // Patch what the response actually carries, so the row, the gate banner
        // and the readiness number move the instant the dialog closes.
        setRun((prev) =>
          prev
            ? {
                ...prev,
                overall_readiness: res.overall_readiness,
                publication_gate: res.publication_gate,
                gaps: prev.gaps.map((g) =>
                  g.result_id === res.result_id ? { ...g, resolved: res.resolved } : g,
                ),
              }
            : prev,
        );
        setTarget(null);
        // The response says nothing about per-framework scores or rule detail,
        // and the server recomputes those on every read — so reconcile them in
        // the background. Without this the framework cards keep the pre-resolve
        // counts while the overall number next to them has already moved.
        reload(true);
      })
      .catch((e) =>
        setSaveError(e instanceof Error ? e.message : 'Failed to mark the gap resolved.'),
      )
      .finally(() => setSaving(false));
  };

  // A run that errored has no results and never will — it doesn't become done.
  const failed = run != null && !isRunDone(run.status) && isTerminalStatus(run.status);

  return (
    <div>
      <ComplianceHeader />
      <ComplianceStepper activeStep={2} />

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
      ) : failed ? (
        <ComplianceNotice
          title="This validation run didn’t finish"
          detail="The run stopped before it could assess anything — usually because the report couldn’t be read. Nothing was scored, so there are no results here. Start a new run to try again."
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
          {/* A certified run is a permanent record — resolve actions are hidden
              rather than disabled, since there is nothing left to act on. */}
          {run.certified && <CertifiedBanner />}

          <ReadinessBand run={run} />

          {run.frameworks.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              {run.frameworks.map((f) => (
                <FrameworkCard key={f.regulator} f={f} />
              ))}
            </div>
          )}

          <GapsTable gaps={run.gaps} onResolve={setTarget} readOnly={run.certified} />
          <RuleAccordion detail={run.rule_detail} />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <button
              type="button"
              className="btn bs"
              onClick={() => navigate(setupHref(run))}
              style={{ fontSize: 13, padding: '9px 18px' }}
            >
              ← Back to set up
            </button>
            <button
              type="button"
              className="btn bp"
              onClick={() => navigate(`/compliance/runs/${run.run_id}/gate`)}
              style={{ fontSize: 13, padding: '10px 20px' }}
            >
              {run.certified ? 'View certification →' : 'Publication decision →'}
            </button>
          </div>
        </>
      )}

      {target && (
        <ResolveGapDialog
          gap={target}
          saving={saving}
          error={saveError}
          onConfirm={confirmResolve}
          onClose={() => {
            setTarget(null);
            setSaveError(null);
          }}
        />
      )}
    </div>
  );
}
