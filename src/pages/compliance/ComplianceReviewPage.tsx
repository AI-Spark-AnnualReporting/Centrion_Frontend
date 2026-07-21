// Screen 2 of the Compliance Validation wizard — readiness score, per-framework
// scores, the gaps table, and the rule-level trace accordion.
//
// Two rules drive most of the styling here:
//   · `no_data` is not a failure — it means no evidence source is wired for
//     that rule yet. It renders grey ("Awaiting data"), never red.
//   · A null score means nothing was scoreable, not zero.

import { useState } from 'react';
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
  ComplianceHeader,
  ComplianceNotice,
  DARK,
  GateChip,
  groupCounts,
  MONO,
  MUTED,
  PRIMARY,
  RED,
  safeScore,
  scoreColor,
  SeverityChip,
  StatusIcon,
  statusLabel,
  useComplianceRun,
} from './compliance-ui';

// ── top band ─────────────────────────────────────────────────────────────────

function ReadinessBand({ run }: { run: ComplianceRun }) {
  const score = safeScore(run.overall_readiness);
  const blocked = run.publication_gate === 'blocked';
  const hardFailing = run.gaps.filter((g) => g.gate === 'HARD' && !g.resolved).length;
  const awaiting = run.frameworks.reduce((n, f) => n + (f.no_data ?? 0), 0);

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
        {awaiting > 0 && (
          <div style={{ fontSize: 12, color: MUTED, fontFamily: MONO }}>
            {awaiting} checks pending
          </div>
        )}
      </div>

      {score == null && (
        <div style={{ marginTop: 12, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          No rule in this run had an evidence source wired yet, so there was nothing to score. This
          is a gap in our extractors, not in the report.
        </div>
      )}

      {blocked ? (
        <div
          style={{
            marginTop: 16,
            padding: '11px 14px',
            borderRadius: 10,
            background: 'rgba(239,68,68,.08)',
            border: '1px solid rgba(239,68,68,.25)',
            fontSize: 12.5,
            fontWeight: 700,
            color: RED,
          }}
        >
          ⊘ Publication blocked — {hardFailing} HARD{' '}
          {hardFailing === 1 ? 'check is' : 'checks are'} failing.
        </div>
      ) : (
        <div
          style={{
            marginTop: 16,
            padding: '11px 14px',
            borderRadius: 10,
            background: 'rgba(34,197,94,.08)',
            border: '1px solid rgba(34,197,94,.25)',
            fontSize: 12.5,
            fontWeight: 700,
            color: '#16A34A',
          }}
        >
          ✓ Ready to publish — no HARD checks are failing.
        </div>
      )}
    </div>
  );
}

// ── framework score cards ────────────────────────────────────────────────────

function FrameworkCard({ f }: { f: FrameworkScore }) {
  const score = safeScore(f.score);
  return (
    <div className="card" style={{ padding: 16, flex: '1 1 200px', minWidth: 190 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: DARK }}>{f.regulator}</div>

      {score == null ? (
        <>
          <div
            style={{ fontSize: 14, fontWeight: 700, color: MUTED, marginTop: 14, lineHeight: 1 }}
          >
            Not scored
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
            {f.no_data} {f.no_data === 1 ? 'check' : 'checks'} pending
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
            {f.no_data > 0 && ` · ${f.no_data} pending`}
          </div>
        </>
      )}
    </div>
  );
}

// ── gaps table ───────────────────────────────────────────────────────────────

function GapsTable({ gaps, onResolve }: { gaps: Gap[]; onResolve: (gap: Gap) => void }) {
  return (
    <div className="card" style={{ marginBottom: 14, overflow: 'hidden' }}>
      <div className="uhead">
        <div>
          <span className="uhead-title">Gaps &amp; recommendations</span>
          <span className="uhead-count">{gaps.length}</span>
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
                const missing = g.evidence?.missing ?? [];
                return (
                  <tr key={g.result_id} className="urow">
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700 }}>{g.regulator}</div>
                      <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{g.rule_id}</div>
                    </td>
                    <td style={{ maxWidth: 300, lineHeight: 1.55 }}>{g.finding}</td>
                    <td>
                      <SeverityChip severity={g.severity} />
                    </td>
                    <td>
                      <GateChip gate={g.gate} />
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      {g.evidence?.expected && (
                        <div style={{ fontSize: 11, color: '#5A6080' }}>
                          Expected {g.evidence.expected}
                        </div>
                      )}
                      {missing.length > 0 && (
                        <div style={{ fontSize: 11, color: RED, fontFamily: MONO, marginTop: 3 }}>
                          missing {missing.slice(0, 6).join(', ')}
                          {missing.length > 6 && ` +${missing.length - 6} more`}
                        </div>
                      )}
                      {g.evidence?.evidence_source && (
                        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 3 }}>
                          {g.evidence.evidence_source}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {g.resolved ? (
                        <span className="badge b-gn">● Resolved</span>
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
            Every check traced to its evidence source. Rules marked “awaiting data” have no
            extractor wired yet — they are not failures.
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
                {c.noData > 0 && ` · ${c.noData} awaiting`}
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
                        style={{
                          fontSize: 11,
                          color: r.status === 'no_data' ? MUTED : '#5A6080',
                          fontWeight: 600,
                        }}
                      >
                        {statusLabel(r.status)}
                      </span>
                      <GateChip gate={r.gate} />
                    </div>
                    {r.evidence_source && (
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
                        <span style={{ color: PRIMARY, fontWeight: 700 }}>evidence</span>{' '}
                        {r.evidence_source}
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
  const { run, loading, error, setRun } = useComplianceRun(runId);

  const [target, setTarget] = useState<Gap | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const confirmResolve = (reason: string) => {
    if (!target) return;
    setSaving(true);
    setSaveError(null);
    complianceValidation
      .resolveGap(target.result_id, reason)
      .then((res) => {
        // Patch in place — the row, the gate banner and the readiness number all
        // come from this response. No refetch, no page reload.
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
      })
      .catch((e) =>
        setSaveError(e instanceof Error ? e.message : 'Failed to mark the gap resolved.'),
      )
      .finally(() => setSaving(false));
  };

  // Nothing scoreable came back — either the run was empty, or (far more
  // commonly today) every rule is awaiting a data source. Quarterly currently
  // evaluates a single rule with no extractor, so it always lands here. Showing
  // the normal screen would be a wall of grey with a meaningless 0.
  const nothingScoreable =
    run != null &&
    run.gaps.length === 0 &&
    run.frameworks.every((f) => (f.total ?? 0) === 0);

  return (
    <div>
      <ComplianceHeader />
      <ComplianceStepper activeStep={2} />

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
      ) : nothingScoreable ? (
        <>
          <ComplianceNotice
            title={
              run.report_type === 'quarterly'
                ? 'Quarterly validation is not yet available'
                : 'Nothing scoreable in this run yet'
            }
            detail="No rule here has an evidence source wired up, so there was nothing to pass or fail. This is a gap in our extractors, not in the report — the breakdown below lists every pending check."
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
          <div style={{ marginTop: 14 }}>
            <RuleAccordion detail={run.rule_detail} />
          </div>
        </>
      ) : (
        <>
          <ReadinessBand run={run} />

          {run.frameworks.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              {run.frameworks.map((f) => (
                <FrameworkCard key={f.regulator} f={f} />
              ))}
            </div>
          )}

          <GapsTable gaps={run.gaps} onResolve={setTarget} />
          <RuleAccordion detail={run.rule_detail} />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <button
              type="button"
              className="btn bs"
              onClick={() => navigate('/compliance')}
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
              Publication decision →
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
