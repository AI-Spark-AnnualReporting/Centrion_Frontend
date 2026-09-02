import { CheckCircle2, Loader2, Circle, XCircle } from 'lucide-react';
import type { AgentNode, PipelineOutputSummary } from '@/types/report';

export type QuarterlyPhase = 'running' | 'completed' | 'failed' | 'timeout';

// Display steps for the financial-extraction pipeline. These mirror the
// quarterly worker stages (parse → extract → link → load comparatives).
const QUARTERLY_STEPS = [
  { label: 'Parsing documents', desc: 'Reading and structuring source files' },
  {
    label: 'Extracting figures',
    desc: 'Identifying numbers, units and periods',
  },
  { label: 'Linking drivers', desc: 'Matching each figure to its stated reason' },
  {
    label: 'Loading comparatives',
    desc: 'Aligning YoY and 9-month YTD baselines',
  },
] as const;

// The quarterly pipeline reports counts of figures/drivers/comparatives in its
// run output. These fields are optional — the stats row only renders once the
// backend has populated them (so we never show fabricated numbers).
interface QuarterlyMetrics {
  figures_extracted?: number;
  figures_total?: number;
  drivers_linked?: number;
  drivers_total?: number;
  comparatives_matched?: number;
  comparatives_total?: number;
}

interface QuarterlyGeneratingScreenProps {
  phase: QuarterlyPhase;
  errorMessage?: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
  onKeepWaiting?: () => void;
  period: string | null;
  companyName: string | null;
  nodes?: AgentNode[];
  outputSummary?: (PipelineOutputSummary & QuarterlyMetrics) | null;
}

// Progress 0–100 derived from real backend node states. Mirrors the formula
// used by the ESG GeneratingScreen so the bar advances during long steps.
export function computeProgress(
  phase: QuarterlyPhase,
  nodes: AgentNode[] | undefined,
): number {
  if (phase === 'completed') return 100;
  if (!nodes || nodes.length === 0) return 6;
  const expected = Math.max(nodes.length, 5);
  const completed = nodes.filter((n) => n.status === 'completed').length;
  const running = nodes.filter((n) => n.status === 'running').length;
  const failed = nodes.some((n) => n.status === 'failed');
  if (failed) return Math.min(99, Math.round((completed / expected) * 100));
  return Math.min(99, Math.round(((completed + running * 0.3) / expected) * 100));
}

// Progress for a batch section-produce run, read off the heartbeat the backend
// already writes: agent_runs.output_summary is rewritten after EVERY section as
// {results: [...], total: N}, and the poll endpoint returns it verbatim.
//
// The UI used to throw that away and ask GET /agent_runs/{id}/nodes instead, which
// 404s for every run whose agent_name isn't 'pipeline_run' — so computeProgress
// above saw a permanently empty node list and returned its 6% floor for the whole
// multi-minute run, once every three seconds, for nothing.
//
// Takes `unknown` on purpose. agent_runs.output_summary genuinely holds three
// different shapes (pipeline results, period_not_found, and this), and widening the
// AgentRun union to say so breaks consumers typed against the other two. `total` is
// the discriminator: the pipeline summary has total_uploaded, period_not_found has
// neither.
//
// null means "nothing measured yet" — before the first section lands, or while the
// outline is still being saved. The caller renders that as an indeterminate bar,
// because a percentage nobody measured is a lie the user can see through on a long
// wait.
export function computeProduceProgress(
  summary: unknown,
): { done: number; total: number; percent: number } | null {
  if (!summary || typeof summary !== 'object') return null;
  const s = summary as { results?: unknown; total?: unknown };
  if (typeof s.total !== 'number' || s.total <= 0) return null;
  if (!Array.isArray(s.results)) return null;
  const done = Math.min(s.results.length, s.total);
  // Capped at 99 while running so the bar never overshoots to 100 and back down;
  // the caller passes 100 itself once the run envelope says completed.
  return { done, total: s.total, percent: Math.min(99, Math.round((done / s.total) * 100)) };
}

export function QuarterlyGeneratingScreen({
  phase,
  errorMessage,
  onCancel,
  onRetry,
  onKeepWaiting,
  period,
  companyName,
  nodes,
  outputSummary,
}: QuarterlyGeneratingScreenProps) {
  if (phase === 'failed') {
    return (
      <ResultCard
        title="Extraction failed"
        body={errorMessage ?? 'The financial pipeline reported an error.'}
        primaryLabel={onRetry ? 'Try Again' : undefined}
        onPrimary={onRetry}
        secondaryLabel="Back to Reports"
        onSecondary={onCancel}
        tone="error"
      />
    );
  }

  if (phase === 'timeout') {
    return (
      <ResultCard
        title="Taking longer than expected"
        body="The extraction is usually still running on the server — keep waiting, or come back later from Reports."
        primaryLabel={onKeepWaiting ? 'Keep waiting' : undefined}
        onPrimary={onKeepWaiting}
        secondaryLabel="Back to Reports"
        onSecondary={onCancel}
        tone="warning"
      />
    );
  }

  const isComplete = phase === 'completed';
  const progress = computeProgress(phase, nodes);
  const completedSteps = isComplete
    ? QUARTERLY_STEPS.length
    : Math.min(
        QUARTERLY_STEPS.length,
        Math.floor((progress / 100) * QUARTERLY_STEPS.length),
      );

  const eyebrow = [period, companyName].filter(Boolean).join(' · ');

  // Stats only render when the backend has provided figure/driver counts.
  const stats = (() => {
    if (!outputSummary) return [];
    const tiles: { value: number; total: number | null; label: string }[] = [];
    if (outputSummary.figures_extracted != null) {
      tiles.push({
        value: outputSummary.figures_extracted,
        total: outputSummary.figures_total ?? null,
        label: 'Figures extracted',
      });
    }
    if (outputSummary.drivers_linked != null) {
      tiles.push({
        value: outputSummary.drivers_linked,
        total: outputSummary.drivers_total ?? null,
        label: 'Drivers linked',
      });
    }
    if (outputSummary.comparatives_matched != null) {
      tiles.push({
        value: outputSummary.comparatives_matched,
        total: outputSummary.comparatives_total ?? null,
        label: 'Comparatives matched',
      });
    }
    return tiles;
  })();

  return (
    <div style={{ animation: 'fade-in .4s ease-out' }}>
      {/* Hero */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 16,
          padding: '28px 32px',
          marginBottom: 16,
          background:
            'linear-gradient(135deg,#1B1E40 0%,#272C5C 55%,#343B73 100%)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 32,
        }}
      >
        <ProgressRing progress={progress} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '.5px',
                color: '#7FB4FF',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {eyebrow}
            </div>
          )}
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              lineHeight: 1.1,
              marginBottom: 8,
            }}
          >
            {isComplete ? 'Extraction complete' : "Crunching the quarter's numbers"}
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,.72)',
              maxWidth: 560,
              lineHeight: 1.5,
            }}
          >
            {isComplete
              ? 'Figures and drivers extracted and matched to year-over-year and year-to-date baselines. Review what we found on the next screen.'
              : 'Parsing your documents and matching figures to year-over-year and year-to-date baselines.'}
          </div>

          {stats.length > 0 && (
            <div style={{ display: 'flex', gap: 40, marginTop: 18 }}>
              {stats.map((s) => (
                <div key={s.label}>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>
                    <span style={{ color: '#5FC8E8' }}>{s.value}</span>
                    {s.total != null && (
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: 'rgba(255,255,255,.45)',
                        }}
                      >
                        /{s.total}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'rgba(255,255,255,.6)',
                      marginTop: 2,
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Step checklist */}
      <div className="card" style={{ padding: '6px 20px' }}>
        {QUARTERLY_STEPS.map((step, i) => {
          const done = i < completedSteps;
          const active = !done && i === completedSteps && !isComplete;
          return (
            <div
              key={step.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '16px 0',
                borderBottom:
                  i < QUARTERLY_STEPS.length - 1 ? '1px solid #ECEEF8' : 'none',
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: done
                    ? '#E7F7EF'
                    : active
                      ? '#EEEEFF'
                      : '#F2F3FA',
                }}
              >
                {done ? (
                  <CheckCircle2
                    className="h-5 w-5"
                    style={{ color: '#10B981' }}
                    aria-hidden
                  />
                ) : active ? (
                  <Loader2
                    className="h-5 w-5 animate-spin"
                    style={{ color: '#4040C8' }}
                    aria-hidden
                  />
                ) : (
                  <Circle
                    className="h-4 w-4"
                    style={{ color: '#C5C8DB' }}
                    aria-hidden
                  />
                )}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{ fontSize: 14, fontWeight: 700, color: '#1A1D2E' }}
                >
                  {step.label}
                </div>
                <div style={{ fontSize: 12, color: '#5A6080', marginTop: 1 }}>
                  {step.desc}
                </div>
              </div>

              <StatusBadge done={done} active={active} />
            </div>
          );
        })}
      </div>

      {onCancel && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 18px',
              fontSize: 11,
              fontWeight: 600,
              color: '#5A6080',
              background: 'transparent',
              border: '1px solid #E2E4F0',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Run in background
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ done, active }: { done: boolean; active: boolean }) {
  const cfg = done
    ? { label: 'Done', color: '#10B981', bg: '#E7F7EF' }
    : active
      ? { label: 'In progress', color: '#4040C8', bg: '#EEEEFF' }
      : { label: 'Pending', color: '#9BA3C4', bg: '#F2F3FA' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        color: cfg.color,
        background: cfg.bg,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: cfg.color,
        }}
      />
      {cfg.label}
    </span>
  );
}

// Circular SVG progress indicator with a percentage label in the centre.
function ProgressRing({ progress }: { progress: number }) {
  const size = 120;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, progress)) / 100);
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="qr-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5B8DEF" />
            <stop offset="100%" stopColor="#5FC8E8" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,.14)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#qr-ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>
          {progress}
          <span style={{ fontSize: 13, fontWeight: 700 }}>%</span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,.6)',
            marginTop: -2,
          }}
        >
          Complete
        </div>
      </div>
    </div>
  );
}

// --- Fail / timeout card --------------------------------------------------

interface ResultCardProps {
  title: string;
  body: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tone: 'error' | 'warning';
}

function ResultCard({
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  tone,
}: ResultCardProps) {
  const iconBg = tone === 'error' ? '#EF4444' : '#F59E0B';
  return (
    <div
      className="card"
      style={{
        padding: '40px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        animation: 'fade-in .4s ease-out',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        {tone === 'error' ? (
          <XCircle className="h-6 w-6" style={{ color: '#fff' }} aria-hidden />
        ) : (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M11 6v6M11 16v.01"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: '#1A1D2E',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div
        style={{ fontSize: 12, color: '#5A6080', marginBottom: 22, maxWidth: 520 }}
      >
        {body}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {secondaryLabel && (
          <button
            type="button"
            onClick={onSecondary}
            style={{
              padding: '8px 18px',
              fontSize: 11,
              fontWeight: 600,
              color: '#5A6080',
              background: 'transparent',
              border: '1px solid #E2E4F0',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {secondaryLabel}
          </button>
        )}
        {primaryLabel && (
          <button
            type="button"
            onClick={onPrimary}
            style={{
              padding: '10px 20px',
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              background: '#4040C8',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {primaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
