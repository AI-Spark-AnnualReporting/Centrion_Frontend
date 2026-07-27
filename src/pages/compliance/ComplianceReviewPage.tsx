// Screen 2 of the Compliance Validation wizard — readiness score, per-framework
// scores, the gaps table, and the rule-level trace accordion.
//
// Three rules drive most of the styling here:
//   · `no_data` is not a failure. It means the rule is answered by a filing or
//     register outside this report — grey, never red, never scored.
//   · A null score means nothing was scoreable, not zero.
//   · A null publication gate means the gate hasn't been decided, which is NOT
//     the same as "open". It gets its own branch everywhere it's rendered.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { complianceValidation } from '@/lib/api';
import type {
  ComplianceRun,
  FrameworkScore,
  Gap,
  Gate,
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
  frameworkGates,
  frameworkLabel,
  GapEvidenceBlock,
  GateChip,
  gradeColor,
  GREEN,
  groupCounts,
  isPartiallyEvidenced,
  isRunDone,
  isTerminalStatus,
  MONO,
  MUTED,
  PRIMARY,
  RED,
  safeScore,
  SeverityChip,
  setupHref,
  useRememberScreen,
  StatusIcon,
  statusHint,
  statusLabel,
  useComplianceRun,
} from './compliance-ui';

// ── readiness rail ───────────────────────────────────────────────────────────

// The gate banner. `publication_gate` is null until the run finishes, so this
// branches on all three values explicitly — an `open ? green : red` shape would
// render a null gate as "Ready to publish", which is exactly the wrong thing to
// tell someone about a report nobody has checked yet.
function GateBanner({ gate }: { gate: ComplianceRun['publication_gate'] }) {
  const style = (bg: string, color: string) => ({
    marginTop: 16,
    padding: '11px 13px',
    borderRadius: 10,
    background: bg,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.5,
    color,
  });

  if (gate === 'blocked') {
    return (
      <div style={style('rgba(239,68,68,.10)', RED)}>
        ⊘ Publication blocked — resolve hard-gate gaps below
      </div>
    );
  }
  if (gate === 'open') {
    return (
      <div style={style('rgba(34,197,94,.10)', GREEN)}>
        ✓ Ready to publish — no HARD checks are failing
      </div>
    );
  }
  return (
    <div style={style('#F4F5FB', MUTED)}>
      ◦ Publication gate not decided — this run didn’t reach a verdict
    </div>
  );
}

// The rail summarises the run as three standing questions rather than as seven
// regulators. The API scores frameworks, not dimensions, so each verdict is read
// off the gaps — and a dimension whose frameworks never ran returns null and
// drops out entirely, rather than reporting PASS on checks nobody made.
type Verdict = 'PASS' | 'WARN' | 'BLOCK';

const VERDICT_CLASS: Record<Verdict, string> = {
  PASS: 'b-gn',
  WARN: 'b-am',
  BLOCK: 'b-rd',
};

// Which regulators the Sustainability row speaks for. Unlisted regulators simply
// aren't part of that dimension — a new ESG framework on the backend shows up on
// its own card either way, it just doesn't move this row until it's added here.
const ESG_REGULATORS = ['TADAWUL', 'ISSB', 'GRI', 'SASB', 'GHG_PROTOCOL'];

// Resolved gaps are settled work — they no longer hold a dimension open, exactly
// as they no longer hold the publication gate shut.
function verdictFor(run: ComplianceRun, covers: (regulator: string) => boolean): Verdict | null {
  if (!run.frameworks.some((f) => covers(f.regulator))) return null;
  const open = run.gaps.filter((g) => !g.resolved && covers(g.regulator));
  if (open.some((g) => g.gate === 'HARD')) return 'BLOCK';
  return open.length > 0 ? 'WARN' : 'PASS';
}

const DIMENSIONS: {
  key: string;
  title: string;
  subtitle: string;
  verdict: (run: ComplianceRun) => Verdict | null;
}[] = [
  {
    key: 'cma',
    title: 'CMA',
    subtitle: 'Periodic filing & disclosure',
    verdict: (run) => verdictFor(run, (r) => r === 'CMA'),
  },
  {
    key: 'completeness',
    title: 'Disclosure completeness',
    subtitle: 'All mandatory checks',
    // Every HARD check in the run, whichever regulator raised it — this is the
    // row that mirrors the publication gate, so it never softens to WARN.
    verdict: (run) => {
      if (run.frameworks.length === 0) return null;
      return run.gaps.some((g) => !g.resolved && g.gate === 'HARD') ? 'BLOCK' : 'PASS';
    },
  },
  {
    key: 'sustainability',
    title: 'Sustainability',
    subtitle: 'ESG · advisory',
    verdict: (run) => verdictFor(run, (r) => ESG_REGULATORS.includes(r)),
  },
];

function DimensionRow({
  title,
  subtitle,
  verdict,
}: {
  title: string;
  subtitle: string;
  verdict: Verdict;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 10,
        padding: '11px 13px',
        border: '1px solid #E2E4F0',
        borderRadius: 10,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: DARK }}>{title}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{subtitle}</div>
      </div>
      <span className={`badge ${VERDICT_CLASS[verdict]}`}>{verdict}</span>
    </div>
  );
}

function ReadinessRail({ run }: { run: ComplianceRun }) {
  const score = safeScore(run.overall_readiness);
  const rows = DIMENSIONS.map((d) => ({ ...d, verdict: d.verdict(run) })).filter(
    (d): d is typeof d & { verdict: Verdict } => d.verdict != null,
  );

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, letterSpacing: '.5px' }}>
        SUBMISSION READINESS
      </div>

      {score == null ? (
        <>
          <div style={{ fontSize: 22, fontWeight: 800, color: MUTED, marginTop: 8 }}>
            Not scored
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
            Nothing in this run was scoreable — every applicable rule was either outside this
            report’s scope or answered elsewhere.
          </div>
        </>
      ) : (
        // Deliberately not on the score ramp: this is the run's headline figure,
        // and the gate banner directly under it already carries the verdict.
        <div
          style={{
            fontSize: 46,
            fontWeight: 800,
            fontFamily: MONO,
            lineHeight: 1.05,
            marginTop: 4,
            color: PRIMARY,
          }}
        >
          {score}
          <span style={{ fontSize: 18, fontWeight: 700, color: MUTED }}>/100</span>
        </div>
      )}

      <GateBanner gate={run.publication_gate} />

      {rows.map((d) => (
        <DimensionRow key={d.key} title={d.title} subtitle={d.subtitle} verdict={d.verdict} />
      ))}
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

function FrameworkCard({ f, gate }: { f: FrameworkScore; gate?: Gate }) {
  const score = safeScore(f.score);
  const color = gradeColor(score);
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#5A6080', letterSpacing: '.5px' }}>
          {f.regulator.toUpperCase()}
        </span>
        <span style={{ flex: 1 }} />
        {/* Absent when the run's rule detail doesn't name this regulator — an
            unbadged card is honest, a guessed HARD is not. */}
        {gate && <GateChip gate={gate} />}
      </div>

      {/* A null score is not a zero — nothing here was scoreable, so there is no
          number to show. Say that in words rather than rendering 0. */}
      {score == null ? (
        <>
          <div
            style={{ fontSize: 16, fontWeight: 800, color: MUTED, marginTop: 14, lineHeight: 1 }}
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
              fontSize: 34,
              fontWeight: 800,
              fontFamily: MONO,
              lineHeight: 1,
              marginTop: 10,
              color,
            }}
          >
            {score}
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
            {f.passed}/{f.total} checks · {frameworkLabel(f.regulator)}
          </div>
          {f.no_data > 0 && (
            <div
              style={{ fontSize: 10.5, color: MUTED, marginTop: 3 }}
              title="Answered by a filing or register outside this report."
            >
              {f.no_data} not in this report
            </div>
          )}
          <div
            style={{
              marginTop: 12,
              height: 4,
              borderRadius: 3,
              background: '#ECEEF8',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: `${score}%`, height: '100%', background: color }} />
          </div>
        </>
      )}
    </div>
  );
}

function FrameworkScores({ run }: { run: ComplianceRun }) {
  const gates = useMemo(() => frameworkGates(run.rule_detail), [run.rule_detail]);
  // `total` counts only the scoreable rules, which is what each card's "n/m
  // checks" adds up — so the header and the cards agree by construction.
  const checks = run.frameworks.reduce((n, f) => n + f.total, 0);
  // Rules answered somewhere other than this report. A handful, not a wall.
  const outsideReport = run.frameworks.reduce((n, f) => n + (f.no_data ?? 0), 0);
  const count = run.frameworks.length;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <h3 style={{ fontSize: 17, fontWeight: 800, color: DARK, letterSpacing: '-.2px' }}>
          Framework scores
        </h3>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: MUTED }}>
          {count} {count === 1 ? 'framework' : 'frameworks'} · {checks}{' '}
          {checks === 1 ? 'check' : 'checks'}
          {outsideReport > 0 && ` · ${outsideReport} not in this report`}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        {run.frameworks.map((f) => (
          <FrameworkCard key={f.regulator} f={f} gate={gates.get(f.regulator)} />
        ))}
      </div>
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

          {/* Readiness rail beside the framework grid. The two flex bases wrap
              to full width below ~780px; the lopsided grow factors keep the rail
              at its 340px cap and give the grid everything else while they
              share a line. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div style={{ flex: '1 1 300px', minWidth: 280, maxWidth: 340 }}>
              <ReadinessRail run={run} />
            </div>
            {run.frameworks.length > 0 && (
              <div style={{ flex: '999 1 460px', minWidth: 280 }}>
                <FrameworkScores run={run} />
              </div>
            )}
          </div>

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
