// The wait between "Run validation" and the results. POST /runs answers 202 in
// under a second, before anything has been checked — the actual work takes
// 30–60s because the checker reads the whole report through an LLM. That's long
// enough to need a screen of its own rather than a spinner on the setup form.
//
// This screen polls GET /runs/{run_id} and hands off to the review screen the
// moment the run reports `done`. A run that reports `error` is terminal — it
// never becomes done — so polling stops and the user is offered a retry.

import { useCallback, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import AiLoadingScreen from '@/pages/onboarding/AiLoadingScreen';
import { complianceValidation } from '@/lib/api';
import type { CreateRunPayload } from '@/types/compliance';
import {
  ComplianceNotice,
  formatElapsed,
  isRunDone,
  runProgress,
  useComplianceRunPoll,
} from './compliance-ui';

// Three stages, and only three, because only three are actually observable from
// the API: the run was accepted, it is reading, it has scored. Anything
// finer-grained would be invented — the poll response carries no per-check
// state while the run is in flight.
const MILESTONES = [
  'Validation run accepted',
  'Reading your report against each rule',
  'Scoring frameworks and the publication gate',
];

const TIPS = [
  'Each check is read from your report’s own words — the sentence it relied on is shown with the result.',
  '“Not in this report” means a rule is answered by a filing or register elsewhere. It isn’t a gap in your writing.',
  'Hard-gate failures block publication. Soft and watch rules are advisory.',
  'A partially-evidenced rule still counts as a gap — the checker tells you what was missing from it.',
];

// Handed over by the setup screen so a failed run can be retried from here
// without sending the user back to re-pick everything. Absent on a deep link or
// a refresh, in which case retry falls back to the setup screen.
export interface ComplianceRunningState {
  payload?: CreateRunPayload;
  checksQueued?: number;
  subjectTitle?: string;
}

export default function ComplianceRunningPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const handoff = (location.state ?? null) as ComplianceRunningState | null;

  // Bumping this restarts the poll — used by "Keep waiting" and by the retry
  // after a dropped connection.
  const [attempt, setAttempt] = useState(0);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState('');

  const { run, error, elapsedMs, timedOut } = useComplianceRunPoll(runId, attempt);

  const done = isRunDone(run?.status);
  const failed = run?.status === 'error';

  const goToResults = useCallback(() => {
    if (runId) navigate(`/compliance/runs/${runId}`, { replace: true });
  }, [navigate, runId]);

  // Start the whole run again with the same inputs. Only possible when the
  // setup screen handed the payload over.
  const retryRun = () => {
    if (!handoff?.payload) {
      navigate('/compliance');
      return;
    }
    setRestarting(true);
    setRestartError('');
    complianceValidation
      .createRun(handoff.payload)
      .then((res) =>
        navigate(`/compliance/runs/${res.run_id}/running`, {
          replace: true,
          state: {
            payload: handoff.payload,
            checksQueued: res.checks_queued,
            subjectTitle: handoff.subjectTitle,
          } satisfies ComplianceRunningState,
        }),
      )
      .catch((e) =>
        setRestartError(e instanceof Error ? e.message : 'Could not start a new validation run.'),
      )
      .finally(() => setRestarting(false));
  };

  const backToSetup = (
    <button
      type="button"
      className="btn bs"
      onClick={() => navigate('/compliance')}
      style={{ fontSize: 12.5, padding: '8px 16px' }}
    >
      ← Back to set up
    </button>
  );

  // ── terminal: the report couldn't be read ────────────────────────────────
  // This never resolves on its own, so there is nothing to wait for.
  if (failed) {
    return (
      <Shell>
        <ComplianceNotice
          title="We couldn’t read this report"
          detail={
            run?.error ||
            run?.error_message ||
            'The validation run stopped before it could assess anything — usually because the report couldn’t be read. Nothing was scored, so there are no results to show.'
          }
          tone="error"
          action={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn bp"
                onClick={retryRun}
                disabled={restarting}
                style={{ fontSize: 12.5, padding: '9px 18px', opacity: restarting ? 0.5 : 1 }}
              >
                {restarting ? 'Starting…' : 'Try again'}
              </button>
              {backToSetup}
            </div>
          }
        />
        {restartError && (
          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: '#DC2626' }}>
            {restartError}
          </div>
        )}
      </Shell>
    );
  }

  // ── lost contact with the API ────────────────────────────────────────────
  // The run itself is very likely still going server-side, so the first offer
  // is to resume watching it, not to start over.
  if (error) {
    return (
      <Shell>
        <ComplianceNotice
          title="Lost contact with the compliance service"
          detail={`${error} The run may still be going — try watching it again.`}
          tone="error"
          action={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn bp"
                onClick={() => setAttempt((n) => n + 1)}
                style={{ fontSize: 12.5, padding: '9px 18px' }}
              >
                Keep watching
              </button>
              {backToSetup}
            </div>
          }
        />
      </Shell>
    );
  }

  // ── overran the safety ceiling ───────────────────────────────────────────
  if (timedOut) {
    return (
      <Shell>
        <ComplianceNotice
          title="This run is taking longer than expected"
          detail="A validation normally finishes in under a minute. It may still complete — keep waiting, or come back to it from the set-up screen."
          action={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn bp"
                onClick={() => setAttempt((n) => n + 1)}
                style={{ fontSize: 12.5, padding: '9px 18px' }}
              >
                Keep waiting
              </button>
              {backToSetup}
            </div>
          }
        />
      </Shell>
    );
  }

  // ── in flight ────────────────────────────────────────────────────────────
  // Progress is only a number when the backend says how many checks are done.
  // When it doesn't, the bar stays indeterminate and the caption reports what we
  // genuinely know — how long it has been going and how much was queued. A bar
  // climbing on a timer would be visibly wrong on a wait this long.
  const percent = runProgress(run);
  const queued = run?.checks_queued ?? handoff?.checksQueued ?? null;
  const completed = run?.checks_completed;

  // The clock counts from when this screen mounted, which is the run's real
  // start time only when we came straight from the setup screen. On a deep link
  // or a refresh the run began earlier, so the elapsed figure is dropped rather
  // than shown short.
  const caption =
    percent != null && queued != null
      ? `${completed} of ${queued} checks · ${percent}%`
      : [
          handoff?.payload ? `${formatElapsed(elapsedMs)} elapsed` : null,
          'usually 30–60s',
          queued != null ? `${queued} ${queued === 1 ? 'check' : 'checks'} queued` : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1400, overflowY: 'auto' }}>
      <AiLoadingScreen
        title="Checking your report against its regulators"
        subtitle={
          handoff?.subjectTitle
            ? `Reading ${handoff.subjectTitle} to see what it actually says.`
            : 'Reading the report itself to see what it actually says.'
        }
        doneTitle="Validation complete"
        doneSubtitle="Taking you to the results…"
        milestones={MILESTONES}
        tips={TIPS}
        // Stage 1 until the first poll lands, stage 2 while it reads. Stage 3
        // only completes when the run does.
        activeMilestone={run ? 1 : 0}
        controlledProgress={percent ?? undefined}
        indeterminate={percent == null}
        progressCaption={caption}
        done={done}
        onDone={goToResults}
      />
    </div>
  );
}

// Error states drop the full-bleed loader and sit in the normal page flow, so
// the app chrome (and the way back) stays where the user expects it.
function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 640, margin: '48px auto 0' }}>{children}</div>;
}
