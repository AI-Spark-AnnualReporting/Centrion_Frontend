import { useEffect, useState } from 'react';
import { AgentTimeline } from './AgentTimeline';
import { EXPECTED_AGENTS } from '@/lib/agent-labels';
import type { AgentNode } from '@/types/report';

const STEPS = [
  'Uploading & reading documents',
  'Extracting ESG data points',
  'Mapping to GRI / IFRS / SAMA metrics',
  'Calculating pillar coverage',
  'Identifying gaps & impacts',
];

export type GeneratingPhase = 'running' | 'completed' | 'failed' | 'timeout';

interface GeneratingScreenProps {
  onComplete?: () => void;
  onCancel?: () => void;

  // Poll-driven mode — when `phase` is provided the screen holds on the last
  // step while "running", finalises on "completed", and swaps to a failure /
  // timeout card on the other two phases.
  phase?: GeneratingPhase;
  errorMessage?: string | null;
  onRetry?: () => void;
  onKeepWaiting?: () => void;
  fileName?: string | null;

  // When provided, the Processing page polls per-agent node rows and passes
  // them through here; we render the live AgentTimeline instead of the
  // legacy timer-driven stepper. Omit to keep the old UX (ReportsPage's
  // existing-report flow does this).
  nodes?: AgentNode[];
}

export function GeneratingScreen({
  onComplete,
  onCancel,
  phase,
  errorMessage,
  onRetry,
  onKeepWaiting,
  fileName,
  nodes,
}: GeneratingScreenProps) {
  const isExternallyDriven = phase !== undefined;
  const [activeIdx, setActiveIdx] = useState(0);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  const [progress, setProgress] = useState(8);

  // Visual step-through animation. When externally driven, we pause on the
  // last step (without marking it done) until phase flips to "completed".
  // Skipped entirely in node-driven mode — the AgentTimeline plus the
  // progressDisplay computed below are the real source of truth, so timers
  // here would only fight with them.
  useEffect(() => {
    if (nodes !== undefined) return;
    const stepDuration = 2200;
    const lastIdx = STEPS.length - 1;
    const timers: number[] = [];

    STEPS.forEach((_, i) => {
      timers.push(
        window.setTimeout(() => {
          if (i === lastIdx && isExternallyDriven) {
            // Enter the last step but wait for external completion to check it.
            setActiveIdx(lastIdx);
            setProgress((p) => Math.max(p, 95));
            return;
          }
          setDoneSteps((prev) => [...prev, i]);
          setActiveIdx(i + 1);
          setProgress(Math.round(((i + 1) / STEPS.length) * 100));
        }, (i + 1) * stepDuration)
      );
    });

    const trickle = window.setInterval(() => {
      setProgress((p) => {
        const cap = isExternallyDriven
          ? 95
          : Math.round(((activeIdx + 1) / STEPS.length) * 100) - 2;
        return p < cap ? p + 1 : p;
      });
    }, 180);
    timers.push(trickle);

    // Legacy timer-driven completion for callers that don't pass a phase.
    if (!isExternallyDriven) {
      timers.push(
        window.setTimeout(() => {
          onComplete?.();
        }, STEPS.length * stepDuration + 600)
      );
    }

    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll-driven completion. When phase flips to "completed", finalise the
  // animation (check every step, snap to 100%) and then fire onComplete.
  useEffect(() => {
    if (phase !== 'completed') return;
    setDoneSteps(STEPS.map((_, i) => i));
    setActiveIdx(STEPS.length);
    setProgress(100);
    const t = window.setTimeout(() => onComplete?.(), 450);
    return () => window.clearTimeout(t);
  }, [phase, onComplete]);

  if (phase === 'failed') {
    return (
      <ResultCard
        title="Report generation failed"
        body={errorMessage ?? 'The pipeline reported an error.'}
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
        body="The pipeline is usually still running on the server — keep waiting, or come back later from Reports."
        primaryLabel={onKeepWaiting ? 'Keep waiting' : undefined}
        onPrimary={onKeepWaiting}
        secondaryLabel="Back to Reports"
        onSecondary={onCancel}
        tone="warning"
      />
    );
  }

  // Progress shown under the timeline. In node-driven mode each completed
  // agent = 1/N of the bar; a currently-running agent contributes a small
  // partial credit so the bar visibly advances during a long-running step
  // rather than freezing between completions. Capped at 99 % until the run
  // envelope flips to "completed" so we never overshoot into 100 % and then
  // back down.
  const progressDisplay = (() => {
    if (!nodes) return progress;
    if (phase === 'completed') return 100;
    const completed = nodes.filter((n) => n.status === 'completed').length;
    const running = nodes.filter((n) => n.status === 'running').length;
    const fraction = (completed + running * 0.3) / EXPECTED_AGENTS.length;
    return Math.min(99, Math.round(fraction * 100));
  })();

  return (
    <div className="card" style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'fade-in .4s ease-out' }}>
      <div className="proc-ring" style={{ marginBottom: 18 }} />
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1D2E', marginBottom: 4 }}>Generating ESG Report</div>
      <div style={{ fontSize: 12, color: '#5A6080', marginBottom: fileName ? 6 : 22 }}>
        Extracting, mapping & scoring metrics from your documents
      </div>
      {fileName && (
        <div style={{ fontSize: 11, color: '#9BA3C4', marginBottom: 18, fontFamily: "'DM Mono',monospace" }}>
          {fileName}
        </div>
      )}

      {nodes ? (
        <AgentTimeline nodes={nodes} />
      ) : (
        <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {STEPS.map((txt, i) => {
            const isDone = doneSteps.includes(i);
            const isActive = !isDone && i === activeIdx;
            const cls = `proc-step ${isDone ? 'done' : isActive ? 'act' : ''}`;
            return (
              <div key={i} className={cls} style={{ animation: isActive ? 'fade-in .3s ease-out' : undefined }}>
                <div className="proc-dot" />
                <span className="proc-txt">{txt}</span>
                <div className="proc-ck">
                  <svg viewBox="0 0 9 9" fill="none">
                    <path d="M2 4.5l1.8 1.8 3.2-3.2" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 520, height: 5, background: '#E8EAF5', borderRadius: 3, overflow: 'hidden', marginTop: 22 }}>
        <div style={{ height: '100%', background: 'linear-gradient(90deg,#4040C8,#6366F1)', borderRadius: 3, width: `${progressDisplay}%`, transition: 'width .4s ease' }} />
      </div>
      <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 8, fontFamily: "'DM Mono',monospace" }}>{progressDisplay}% complete</div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          style={{ marginTop: 22, padding: '8px 18px', fontSize: 11, fontWeight: 600, color: '#5A6080', background: 'transparent', border: '1px solid #E2E4F0', borderRadius: 8, cursor: 'pointer' }}
        >
          {isExternallyDriven ? 'Run in background' : 'Cancel'}
        </button>
      )}
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

function ResultCard({ title, body, primaryLabel, onPrimary, secondaryLabel, onSecondary, tone }: ResultCardProps) {
  const iconBg = tone === 'error' ? '#EF4444' : '#F59E0B';
  return (
    <div
      className="card"
      style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'fade-in .4s ease-out' }}
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
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          {tone === 'error' ? (
            <path d="M7 7l8 8M15 7l-8 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M11 6v6M11 16v.01" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1D2E', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#5A6080', marginBottom: 22, maxWidth: 520 }}>{body}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {secondaryLabel && (
          <button
            type="button"
            onClick={onSecondary}
            style={{ padding: '8px 18px', fontSize: 11, fontWeight: 600, color: '#5A6080', background: 'transparent', border: '1px solid #E2E4F0', borderRadius: 8, cursor: 'pointer' }}
          >
            {secondaryLabel}
          </button>
        )}
        {primaryLabel && (
          <button
            type="button"
            onClick={onPrimary}
            style={{ padding: '10px 20px', fontSize: 12, fontWeight: 700, color: '#fff', background: '#4040C8', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            {primaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
