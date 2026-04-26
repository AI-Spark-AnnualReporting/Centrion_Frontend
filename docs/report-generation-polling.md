# How "Generate Report" Polling Works

A plain-English walkthrough of what happens from the moment the user clicks
**Generate Report** until the finished report appears on screen.

If you only read one thing: generating a report is a **long-running background
job on the backend**. The frontend doesn't wait on a single HTTP request — it
kicks the job off, gets a ticket number, navigates to a loading screen, and
then calls a "how's it going?" endpoint every 3 seconds until the job says
`completed` or `failed`.

---

## The big picture in one diagram

```
User clicks "Generate"
        │
        ▼
ReportsPage  ──POST /reports/{companyId}/generate──▶  Backend
        ▲                                               │
        │                   202 Accepted                │
        │   { run_id, poll_url, estimated_duration }    │
        │◀──────────────────────────────────────────────┘
        │
        │  navigate(/reports/processing, { state })
        ▼
ProcessingPage ──GET poll_url (every 3s)──▶ Backend
        ▲                                      │
        │     { status: "running" | "completed" | "failed", ... }
        │◀─────────────────────────────────────┘
        │           (loop until done)
        │
        │  on "completed": fetch /coverage, then navigate back
        ▼
ReportsPage renders the finished report
```

---

## The key idea: synchronous vs. asynchronous

**Old (synchronous) way — what this used to be:**
- Frontend calls `POST /generate`.
- The browser waits for a single HTTP response.
- The backend does all the work (parsing PDFs, running agents, writing to the
  DB) inside that one request.
- If it takes 15 minutes, the browser sits on one long HTTP call.
- Any hiccup (proxy timeout, tab refresh, flaky Wi‑Fi) kills the whole thing.

**New (asynchronous) way — what we have now:**
- Frontend calls `POST /generate`.
- Backend immediately says *"got it, I've started a background job, here's
  the ticket number (`run_id`) and the URL where you can check on it
  (`poll_url`). Bye."* — status code **202 Accepted**.
- Frontend navigates to a dedicated **Processing** page and **polls** the
  status URL every 3 seconds.
- When the job reports `completed`, the frontend fetches the finished data
  and renders the report. When it reports `failed`, the frontend shows the
  error.

The background job can now take as long as it needs. The user can even close
the tab and come back — we'll pick up where we left off (see
["Resuming a run"](#8-resuming-a-run-localstorage)).

---

## The cast of characters (the files involved)

| File | Role |
|------|------|
| `src/pages/ReportsPage.tsx` | The page where the user clicks "Generate Report". Fires the POST and navigates to the processing page. |
| `src/lib/api.ts` | HTTP client. Has `reports.generate(...)` which returns a `PipelineHandle`. |
| `src/types/report.ts` | Type definitions. `PipelineHandle`, `AgentRun`, etc. |
| `src/pages/ProcessingPage.tsx` | The loading screen route (`/reports/processing`). Owns the poll loop. |
| `src/hooks/use-pipeline-poll.ts` | The actual polling loop. A custom hook that runs the interval, parses the response, and exposes the current phase. |
| `src/components/reports/GeneratingScreen.tsx` | The animated stepper UI that the user sees while polling. |
| `src/lib/active-pipeline.ts` | localStorage helpers so we can resume a run after a refresh / tab close. |

---

## Step-by-step walkthrough

### 1. The user clicks "Generate Report"

Inside `ReportsPage.tsx` there's a form that collects the file(s), year,
sector, frameworks, etc. Submitting it calls `reports.generate(...)` via
the typed API client.

```ts
reportsApi.generate(companyId, {
  files: [pending.file],
  year: pending.year,
  sector_id: pending.sector_id,
  scope_type: pending.scope_type,
  report_type: 'esg',
  framework_codes: pending.framework_codes,
})
```

### 2. `reports.generate` — building the multipart POST

In `src/lib/api.ts` (around line 456), `reports.generate` builds a
`FormData` body (because we're sending files) and hands off to a helper
called `postPipeline`:

```ts
generate: (companyId, body): Promise<PipelineHandle> => {
  const fd = new FormData();
  body.files.forEach((f) => fd.append("files", f));
  fd.append("year", String(body.year));
  fd.append("sector_id", body.sector_id);
  // ...etc
  return postPipeline(
    `/api/v1/reports/${encodeURIComponent(companyId)}/generate`,
    fd,
  );
}
```

### 3. `postPipeline` — normalizing 202 and 409

This is the helper that talks to any endpoint that starts a background job
(generate, addDocuments, documents.upload). It handles **two possible good
outcomes**:

- **202 Accepted** — "new background job started". Body contains
  `run_id`, `poll_url`, `started_at`, etc.
- **409 Conflict** — "a job is *already* running for this report; here's the
  ticket number of the existing one". This is what the backend returns if
  the user clicks Generate twice, or comes back after a crash.

`postPipeline` normalizes **both responses into one shape** called
`PipelineHandle` so the rest of the app doesn't have to care which case it
was:

```ts
interface PipelineHandle {
  runId: string;
  pollUrl: string;
  reportId: string | null;
  startedAt: string;
  estimatedDurationSeconds: number | null;
  fileCount: number | null;
  isExisting: boolean;    // ← true if we reconnected to an existing run
  message?: string;       // ← the 409's human-readable message, if any
}
```

One small subtlety: FastAPI wraps `HTTPException` bodies under a `detail`
key, so the code reads `raw?.detail ?? raw` to accept either shape.

### 4. ReportsPage navigates to /reports/processing

When the promise resolves, ReportsPage stuffs the handle into React Router
location state and navigates:

```ts
.then((handle) => {
  const processingState: ProcessingPageState = {
    runId: handle.runId,
    pollUrl: handle.pollUrl,
    reportId: handle.reportId,
    companyId,
    estimatedDurationSeconds: handle.estimatedDurationSeconds,
    fileName: pending.file.name,
    isExisting: handle.isExisting,
    conflictMessage: handle.message,
  };
  navigate('/reports/processing', { replace: true, state: processingState });
})
```

The `replace: true` matters: it keeps the browser back-button from returning
to the form's transient "submitting" state.

### 5. ProcessingPage mounts and starts the poll loop

`/reports/processing` is wired to `ProcessingPage.tsx`. The first thing it
does on mount is read the navigation state and hand the `pollUrl` to the
polling hook:

```ts
const state = location.state as ProcessingPageState | null;
const pollUrl = state?.pollUrl ?? null;
const { state: poll, restart } = usePipelinePoll(pollUrl);
```

It also saves the active pipeline to localStorage so we can resume if the
user leaves. (See section 8.)

### 6. `usePipelinePoll` — the actual polling loop

This is the heart of the whole system. Lives in
`src/hooks/use-pipeline-poll.ts`.

**Constants:**
- `POLL_INTERVAL_MS = 3000` — we ping the backend every 3 seconds.
- `MAX_WATCH_MS = 30 * 60 * 1000` — after 30 minutes we *stop polling* and
  show a "Keep waiting?" screen (not a hard kill — user can resume).

**The state it exposes is a discriminated union:**

```ts
type PipelinePollState =
  | { phase: "idle";      run: null;            elapsedMs: 0 }
  | { phase: "running";   run: AgentRun | null; elapsedMs: number }
  | { phase: "completed"; run: AgentRun;        elapsedMs: number }
  | { phase: "failed";    run: AgentRun;        elapsedMs: number }
  | { phase: "timeout";   run: AgentRun | null; elapsedMs: number };
```

Callers just look at `phase` and render accordingly.

**What the effect does, in plain English:**

1. If there's no `pollUrl`, sit at `idle` and do nothing.
2. Record the time we started (`mountedAtRef.current = Date.now()`).
3. Create an `AbortController` so we can cancel any in-flight fetch on
   unmount.
4. Start a `setInterval` that calls `tick()` every 3 seconds. Also call
   `tick()` once immediately, so the user doesn't stare at a blank screen
   for 3 seconds before the first update.

**What `tick()` does, each time it runs:**

1. Check elapsed time. If it's over 30 minutes, stop the interval and set
   `phase: "timeout"`.
2. Otherwise, call `agentRuns.getByPollUrl(pollUrl, signal)` which does a
   `GET` on the poll URL with our auth token.
3. Look at the returned `run.status`:
   - `"completed"` → stop polling, set `phase: "completed"`.
   - `"failed"` → stop polling, set `phase: "failed"`.
   - anything else (`"running"`, `"queued"`, etc.) → keep going, update
     `phase: "running"` with the latest run snapshot.
4. If the fetch throws, **swallow the error** and let the next tick try
   again. Transient network blips shouldn't kill the whole poll loop.
5. On unmount (or pollUrl change), the cleanup function aborts the
   in-flight request, clears the interval, and sets a `stopped` flag so any
   mid-flight `tick()` resolution bails out.

**Why a `restartCount` in the dependency array?**

Calling `restart()` bumps that counter, which re-runs the effect from
scratch — used for "Keep waiting" (after a timeout) or "Retry" (after a
coverage-fetch failure). It's a simple way to re-trigger a `useEffect`
without duct-taping the dep array.

### 7. `agentRuns.getByPollUrl` — the actual GET

Defined in `src/lib/api.ts` around line 511. The backend returns the
`poll_url` as either an absolute URL (`https://.../api/v1/agent_runs/abc`)
or a root-relative path (`/api/v1/agent_runs/abc`). We strip our base URL
prefix if present, then call the same authenticated `request<AgentRun>()`
helper everything else uses:

```ts
getByPollUrl: (pollUrl, signal) => {
  const path = pollUrl.startsWith(API_BASE_URL)
    ? pollUrl.slice(API_BASE_URL.length)
    : pollUrl;
  return request<AgentRun>(path, { signal });
}
```

The response shape (`AgentRun`, in `types/report.ts`) is the backend's
canonical view of the job:

```ts
interface AgentRun {
  run_id: string;
  agent_name: string;
  status: "running" | "completed" | "failed" | string;
  started_at: string;
  elapsed_seconds: number;
  completed_at: string | null;
  input_summary: { report_id, file_count, file_names, trigger } | null;
  output_summary: { results[], total_uploaded, succeeded, failed, skipped } | null;
  error_message: string | null;
  ...
}
```

### 8. Resuming a run (localStorage)

As soon as ProcessingPage mounts, it saves the active run to localStorage
under the key `centriton_active_pipeline`:

```ts
saveActivePipeline({
  runId, pollUrl, reportId, companyId, fileName, estimatedDurationSeconds
});
```

This record is cleared on `completed` / `failed` but **intentionally kept
on `timeout`** — that's how "resume" works.

When ReportsPage mounts, it calls `loadActivePipeline()`. If it finds a
saved record, it shows a yellow "Resume watching" banner:
- **Resume** → navigates back to `/reports/processing` with the saved
  handle.
- **Dismiss** → calls `clearActivePipeline()`.

So the user can close the tab, come back tomorrow, and pick up the same run
(as long as the backend is still processing it — if it finished while the
tab was gone, the next poll tick will immediately report `completed`).

### 9. The UI while polling — `GeneratingScreen`

ProcessingPage doesn't render raw progress. It delegates all visuals to
`GeneratingScreen`, the animated stepper component that was already in the
codebase:

```tsx
<GeneratingScreen
  phase={poll.phase === "idle" ? "running" : poll.phase}
  errorMessage={poll.phase === "failed" ? poll.run.error_message : null}
  onCancel={() => navigate("/reports", { replace: true })}
  onRetry={() => navigate("/reports", { replace: true })}
  onKeepWaiting={restart}
  fileName={fileNameFor(poll, state)}
/>
```

- While `phase === "running"` the stepper animates through its steps. When
  it reaches the last step, it **holds there** instead of looping — we're
  waiting on the real job, not faking progress.
- When `phase === "completed"` it stops instantly (we navigate away
  immediately, so the user typically doesn't see the completed frame).
- When `phase === "failed"` it shows the error message plus Retry / Cancel.
- When `phase === "timeout"` it shows the "Keep waiting?" CTA — clicking
  that calls `restart()` which re-starts the 30-minute window.

### 10. On completion — fetch coverage, then hand off

When the poll hook flips to `phase: "completed"`, ProcessingPage runs the
completion effect:

```ts
useEffect(() => {
  if (poll.phase !== "completed" || handedOffRef.current) return;
  const resolvedReportId =
    poll.run.input_summary?.report_id ?? state.reportId ?? null;

  handedOffRef.current = true;
  reportsApi.getCoverage(state.companyId, resolvedReportId).then((cov) => {
    clearActivePipeline();
    navigate("/reports", {
      replace: true,
      state: {
        completedRun: {
          reportId: resolvedReportId,
          companyId: state.companyId,
          outputSummary: poll.run.output_summary,
          wasReconnected: state.isExisting,
          coverage: cov,   // ← pre-fetched, so ReportsPage has no loader flash
        },
      },
    });
  });
}, [poll, navigate, state]);
```

Two important details:

1. **`handedOffRef`** is a ref guard so this effect fires exactly once even
   if React re-runs it.
2. **Coverage is fetched here, not on ReportsPage.** That's a UX decision:
   if we navigated first, ReportsPage would mount with no data, flash a
   loader, *then* fetch coverage. Fetching it here means the report page
   renders immediately when the user lands on it.

### 11. Back on ReportsPage — rendering the finished report

ReportsPage has a `useEffect` that watches `location.state.completedRun`.
When present, it:

1. Uses `completedRun.coverage` directly if it was pre-fetched (the fast
   path — no loader).
2. Falls back to fetching via `reports.getCoverage()` if coverage wasn't
   passed (defensive — shouldn't happen in practice).
3. Calls `buildPartialFailureWarning()` against
   `completedRun.outputSummary.results` to produce a yellow "2 of 3 files
   processed — 1 failed: bad.pdf" banner if any individual files failed
   while the overall run succeeded.
4. Clears `location.state` so a refresh doesn't retrigger the handoff.

---

## Error-handling summary

| Where | What goes wrong | What we do |
|-------|-----------------|------------|
| `POST /generate` | Non-202, non-409 response | `ApiError` bubbles up to ReportsPage, shown as `genError` |
| `POST /generate` | 409 Conflict (existing run) | Normalize to `PipelineHandle` with `isExisting: true`, proceed as if it were a new run |
| `GET poll_url` | Transient network error | Swallow — next tick will try again |
| `GET poll_url` | 401 Unauthorized | `handleUnauthorized()` logs out and redirects to `/login` |
| Poll loop | Over 30 minutes | Phase → `timeout`; show "Keep waiting?" CTA (`restart()` resets the timer) |
| Run | `status: "failed"` | Phase → `failed`; show `error_message` + Retry/Cancel |
| Run | Completed with some file failures | Overall completed, but `output_summary.results` contains failures → warning banner on ReportsPage |
| Coverage fetch after completion | Fails | Show error inside ProcessingPage with a Retry that re-runs the completion effect |
| User navigates away mid-run | — | Record lives in localStorage; resume banner on ReportsPage lets them come back |

---

## Why it's designed this way — tradeoffs worth knowing

- **3-second interval.** Short enough to feel responsive, long enough that
  a 15-minute run is only ~300 requests — cheap. The backend's status
  endpoint is intentionally lightweight.
- **30-minute cap is soft, not hard.** The backend will keep running past
  30 minutes; we just stop auto-polling so a forgotten tab doesn't hit the
  API forever. The user can resume any time.
- **Errors are swallowed during polling.** A single 500 or dropped
  connection shouldn't terminate a 10-minute job from the UI's
  perspective. We only treat the *run*'s `status: "failed"` as failure —
  transport errors are just "try again in 3s".
- **One animated component, not two.** `GeneratingScreen` handles both the
  pre-existing short-report flow and the new async flow by taking an
  optional `phase` prop. Keeps the UI consistent and avoids a
  mid-navigation loader flash.
- **Coverage is pre-fetched on the processing page.** Slightly more code
  on ProcessingPage, but the payoff is that `/reports` renders the
  completed report instantly after navigation instead of flashing a second
  loader.

---

## Cheat-sheet: the five states the user can be in

1. **Idle on /reports** — form visible, maybe a yellow "Resume" banner if
   localStorage has an active run.
2. **Polling on /reports/processing** — animated stepper, status updates
   every 3s.
3. **Timeout on /reports/processing** — "Keep waiting?" CTA; one click
   restarts the 30-minute window.
4. **Failed on /reports/processing** — error message + Retry/Cancel.
5. **Done, back on /reports** — coverage rendered, optional warning for
   per-file failures.
