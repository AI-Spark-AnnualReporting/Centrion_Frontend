// Shared presentational helpers + the run fetcher for the Compliance Validation
// wizard. Keeps the three screens free of duplicated chip/colour logic.
// Mirrors the shape of pages/annual-report/cycle-ui.tsx.

import { useCallback, useEffect, useState } from 'react';
import { complianceValidation } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type {
  CheckStatus,
  ComplianceRun,
  Gate,
  RuleDetailGroup,
  Severity,
} from '@/types/compliance';

export const PRIMARY = '#4040C8';
export const GREEN = '#16A34A';
export const RED = '#DC2626';
export const AMBER = '#B45309';
export const MUTED = '#9BA3C4';
export const DARK = '#1A1D2E';
export const MONO = "'DM Mono', monospace";

const GATE: Record<Gate, string> = {
  HARD: 'b-rd',
  SOFT: 'b-am',
  WATCH: 'b-gy',
};

export function GateChip({ gate }: { gate: Gate }) {
  return <span className={`badge ${GATE[gate] ?? 'b-gy'}`}>{gate}</span>;
}

// The API returns severity lower-case; display it upper-case.
const SEVERITY: Record<Severity, string> = {
  high: 'b-rd',
  medium: 'b-am',
  low: 'b-gy',
};

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span className={`badge ${SEVERITY[severity] ?? 'b-gy'}`}>
      {String(severity ?? '').toUpperCase()}
    </span>
  );
}

// `no_data` means no evidence source is wired for that rule yet — it is NOT a
// failure and must never render red, or the screen reads as alarming and wrong.
const STATUS: Record<CheckStatus, { glyph: string; color: string; label: string }> = {
  pass: { glyph: '✓', color: GREEN, label: 'Pass' },
  fail: { glyph: '✗', color: RED, label: 'Fail' },
  na: { glyph: '–', color: MUTED, label: 'Not applicable' },
  no_data: { glyph: '◦', color: MUTED, label: 'Awaiting data' },
};

export function StatusIcon({ status }: { status: CheckStatus }) {
  const s = STATUS[status] ?? STATUS.na;
  return (
    <span
      title={s.label}
      aria-label={s.label}
      style={{ color: s.color, fontWeight: 800, fontSize: 13, lineHeight: 1 }}
    >
      {s.glyph}
    </span>
  );
}

export function statusLabel(status: CheckStatus): string {
  return (STATUS[status] ?? STATUS.na).label;
}

// Score colour ramp: ≥80 green, 50–79 amber, <50 red. A null score means
// nothing was scoreable — render it muted, never as 0.
export function scoreColor(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return MUTED;
  if (score >= 80) return GREEN;
  if (score >= 50) return AMBER;
  return RED;
}

// Clamp a score to a 0–100 integer, preserving null (= "awaiting data").
export function safeScore(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// rule_detail carries no per-group totals, so derive them from the rule rows.
// Only pass + fail are scoreable; na and no_data are excluded.
export function groupCounts(group: RuleDetailGroup) {
  const rules = group.rules ?? [];
  const passed = rules.filter((r) => r.status === 'pass').length;
  const failed = rules.filter((r) => r.status === 'fail').length;
  const noData = rules.filter((r) => r.status === 'no_data').length;
  return { passed, failed, noData, scoreable: passed + failed, total: rules.length };
}

// `Compliance Validation · {Company Name}` — shown at the top of every screen.
export function ComplianceHeader() {
  const { user } = useAuth();
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: DARK }}>
        Compliance Validation
        {user?.company_name ? (
          <span style={{ color: MUTED, fontWeight: 700 }}> · {user.company_name}</span>
        ) : null}
      </h2>
      <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
        Validate a report against its regulators, review the gaps, then certify for publication.
      </p>
    </div>
  );
}

// Full-width message card for load failures and not-yet-available states.
export function ComplianceNotice({
  title,
  detail,
  tone = 'muted',
  action,
}: {
  title: string;
  detail?: string;
  tone?: 'muted' | 'error';
  action?: React.ReactNode;
}) {
  const color = tone === 'error' ? RED : MUTED;
  return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color }}>{title}</div>
      {detail && (
        <div style={{ fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.6 }}>{detail}</div>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

// Loads GET /runs/{id}. Shared by Review and Gate — both read the same run.
// `setRun` lets resolve/certify patch the loaded run in place, so the screens
// update without a refetch or a page reload.
export function useComplianceRun(runId: string | undefined) {
  const [run, setRun] = useState<ComplianceRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    if (!runId) {
      setRun(null);
      setError('No validation run selected.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    complianceValidation
      .getRun(runId)
      .then(setRun)
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Failed to load the validation run.'),
      )
      .finally(() => setLoading(false));
  }, [runId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { run, loading, error, setRun, reload };
}
