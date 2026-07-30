// The wait between "Run validation" and the results. POST /runs answers 202 in
// under a second, before anything has been checked — the actual work takes
// 30–60s because the checker reads the whole report through an LLM. That's long
// enough to need a screen of its own rather than a spinner on the setup form.
//
// This screen polls GET /runs/{run_id} and hands off to the review screen the
// moment the run reports `done`. A run that reports `error` is terminal — it
// never becomes done — so polling stops and the user is offered a retry.

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import AiLoadingScreen from '@/pages/onboarding/AiLoadingScreen';
import { complianceValidation } from '@/lib/api';
import { useComplianceRuns, useForegroundRun } from '@/context/ComplianceRunsContext';
import {
  blamesTheFile,
  type CreateRunPayload,
  type RunSettings,
  type SubjectType,
} from '@/types/compliance';
import {
  ComplianceNotice,
  formatElapsed,
  isRunDone,
  runProgress,
  setupHref,
  useComplianceRunPoll,
  useRememberScreen,
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
//
// The subject travels separately from the settings because the upload path
// doesn't have one yet: a file only becomes a document once it has been read,
// which is after the 202. For an upload the subject comes from the run itself
// on the first poll — so a retry still re-runs what's already there, and never
// uploads the file a second time.
export interface ComplianceRunningState {
  settings?: RunSettings;
  subject?: { subject_type: SubjectType; subject_id: string };
  checksQueued?: number;
  subjectTitle?: string;
  // Only changes what the user is told: the wait is longer because the file has
  // to be read first, and a failure is likelier to be about the file itself.
  fromUpload?: boolean;
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

  // Walking away from a 60–90 second wait is the likeliest moment to leave.
  useRememberScreen(runId, 'running');

  // This screen is already polling, so the background watcher leaves this run
  // alone for as long as it's open — one poller per run, never two. The claim
  // releases the instant this unmounts, and the watcher picks the run up on its
  // next tick, which is what makes "Continue in background" work.
  useForegroundRun(runId);

  const { report, forget } = useComplianceRuns();

  // Everything this screen learns goes to the dock, so a run that's been left
  // running is already named and placed there before the watcher touches it.
  // `local` never triggers a toast — the user is looking right at it.
  useEffect(() => {
    if (!runId) return;
    report(
      {
        runId,
        status: run?.status ?? 'running',
        title: handoff?.subjectTitle,
        period: handoff?.settings?.period,
        reportType: handoff?.settings?.report_type ?? run?.report_type,
        certified: run?.certified,
        errorCode: run?.error_code ?? null,
      },
      'local',
    );
  }, [
    runId,
    report,
    run?.status,
    run?.report_type,
    run?.certified,
    run?.error_code,
    handoff?.subjectTitle,
    handoff?.settings?.period,
    handoff?.settings?.report_type,
  ]);

  const done = isRunDone(run?.status);
  const failed = run?.status === 'error';

  const goToResults = useCallback(() => {
    if (!runId) return;
    // The user watched this one land and is being taken straight to it, so the
    // dock has nothing left to tell them about it.
    forget(runId);
    navigate(`/compliance/runs/${runId}`, { replace: true });
  }, [navigate, runId, forget]);

  // The subject to re-run: whatever the setup screen named, or — for an upload,
  // which had none to give — whatever the run reports once it has read the
  // file. Null on an `unreadable_file` failure: that document was deleted, and
  // there is nothing left to run.
  const subject =
    handoff?.subject ??
    (run?.subject_id ? { subject_type: run.subject_type, subject_id: run.subject_id } : null);

  // Back to the tab this run came from, with its subject still selected.
  const backHref = setupHref({ report_type: handoff?.settings?.report_type ?? run?.report_type, ...subject });

  const retryRun = () => {
    // Without the settings we don't know the entity type or the framework
    // selection, so back to set up with the subject preselected. Still a re-run
    // of what already exists — never a second upload of the same file.
    if (!handoff?.settings || !subject) {
      navigate(backHref);
      return;
    }
    // `period` rides along in the settings and is required for a document —
    // an uploaded file records none of its own, so dropping it here would 422.
    const payload: CreateRunPayload = { ...subject, ...handoff.settings };
    setRestarting(true);
    setRestartError('');
    complianceValidation
      .createRun(payload)
      .then((res) =>
        navigate(`/compliance/runs/${res.run_id}/running`, {
          replace: true,
          state: {
            settings: handoff.settings,
            subject,
            checksQueued: res.checks_queued,
            subjectTitle: handoff.subjectTitle,
            fromUpload: handoff.fromUpload,
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
      onClick={() => navigate(backHref)}
      style={{ fontSize: 12.5, padding: '8px 16px' }}
    >
      ← Back to set up
    </button>
  );

  // ── terminal: the run failed ─────────────────────────────────────────────
  // This never resolves on its own, so there is nothing to wait for. What to
  // offer depends entirely on whose fault it was, and only `unreadable_file`
  // is the file's — see the two branches below.
  if (failed) {
    const fileToBlame = blamesTheFile(run?.error_code);
    return (
      <Shell>
        <ComplianceNotice
          title={fileToBlame ? 'We couldn’t read this file' : 'This validation didn’t finish'}
          detail={
            run?.error ||
            run?.error_message ||
            (fileToBlame
              ? 'We couldn’t get any text out of this file, so nothing could be scored. The usual cause is a scanned PDF — pages saved as images, with no text layer behind them. A copy exported straight from Word, or a PDF you can select text in, will work.'
              : // Deliberately says nothing about the file. An unknown or absent
                // error_code lands here, and blaming a document that was read
                // perfectly well is what sends people off to re-upload it.
                'The run stopped before it could finish, so nothing was scored. Your report is safe and already loaded — running it again is usually all it takes.')
          }
          tone="error"
          action={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {fileToBlame ? (
                <button
                  type="button"
                  className="btn bp"
                  // Straight to the upload tab, without the failed subject
                  // preselected — the whole point is a different file.
                  onClick={() =>
                    navigate(
                      setupHref({ report_type: handoff?.settings?.report_type ?? run?.report_type }, 'upload'),
                    )
                  }
                  style={{ fontSize: 12.5, padding: '9px 18px' }}
                >
                  Try a different file
                </button>
              ) : (
                <button
                  type="button"
                  className="btn bp"
                  // Re-runs the subject that already exists — never a second
                  // upload. Uploading the same file again would create another
                  // report row and another copy of its documents every time.
                  onClick={retryRun}
                  disabled={restarting}
                  style={{ fontSize: 12.5, padding: '9px 18px', opacity: restarting ? 0.5 : 1 }}
                >
                  {restarting ? 'Starting…' : 'Run it again'}
                </button>
              )}
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
          detail={
            handoff?.fromUpload
              ? 'An uploaded report normally finishes within a couple of minutes — the file has to be read before it can be checked. It may still complete — keep waiting, or come back to it from the set-up screen.'
              : 'A validation normally finishes in under a minute. It may still complete — keep waiting, or come back to it from the set-up screen.'
          }
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
          handoff?.settings ? `${formatElapsed(elapsedMs)} elapsed` : null,
          // An upload is read before it is judged, so it runs longer. Quoting
          // the picker path's 30–60s here would have the screen look stuck at
          // the halfway mark of a perfectly healthy run.
          handoff?.fromUpload ? 'usually 60–90s' : 'usually 30–60s',
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
        // The run is server-side and the dock is already tracking it, so
        // leaving costs nothing: the wait continues without the user in it,
        // and a toast brings them back when there's something to see.
        //
        // Withdrawn the moment the run lands, which is a second or so before
        // this screen finishes its own hand-off animation. Leaving during that
        // window would walk away from a run that is already done — the watcher
        // only announces runs it saw finish, so nothing would ever announce it.
        footer={
          done ? undefined : (
            <button
              type="button"
              className="btn bs"
              onClick={() => navigate(backHref)}
              style={{ fontSize: 12, padding: '8px 16px' }}
            >
              Continue in background →
            </button>
          )
        }
      />
    </div>
  );
}

// Error states drop the full-bleed loader and sit in the normal page flow, so
// the app chrome (and the way back) stays where the user expects it.
function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 640, margin: '48px auto 0' }}>{children}</div>;
}
