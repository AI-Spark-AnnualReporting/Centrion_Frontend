# Spec: Per-Agent Live Timeline on Processing Page (Frontend)

## Overview
This feature replaces the generic "Generating your report..." stepper on the Processing page with a live timeline that shows exactly which agent is currently running, which have completed, which are still pending, and how long each one took. The backend already exposes this data via the new `GET /api/v1/agent_runs/{run_id}/nodes` endpoint, which returns per-node execution rows ordered by start time. The frontend needs to add this endpoint to the polling loop, render a 5-step timeline (one row per expected agent), and update each row's status in real-time as the pipeline progresses. After this step, users will see `✓ Validating file (0.02s) → ✓ Extracting content (4.2s) → ◉ Harvesting ESG indicators (42s...) → ○ Normalizing KPIs → ○ Saving to database` instead of a generic spinner, making the 3-minute wait feel transparent and responsive.

## Depends on
- Async pipeline execution (`POST /generate` returns 202 with `run_id` + `poll_url`) must already be wired up
- Existing `usePipelinePoll` hook polling `GET /agent_runs/{run_id}` every 3 seconds must be working
- Backend endpoint `GET /api/v1/agent_runs/{run_id}/nodes` must be deployed (see backend spec for per-agent progress tracking)
- `GeneratingScreen` component with `phase` and `fileName` props must exist

## Routes
No new frontend routes. This extends the existing `/reports/processing` page behavior.

## Database changes
None. Frontend-only change.

## Templates
No templates. React + TypeScript.

## Files to change
- `src/lib/api.ts` — add `agentRuns.getNodes(runId, signal)` method that GETs `/api/v1/agent_runs/{run_id}/nodes`
- `src/types/report.ts` — add `AgentNode` type and `AgentNodesResponse` type for the new endpoint's response shape
- `src/hooks/use-pipeline-poll.ts` — extend to also fetch node data every tick and expose it in the `PipelinePollState` union
- `src/pages/ProcessingPage.tsx` — pass the nodes data from `usePipelinePoll` into `GeneratingScreen`
- `src/components/reports/GeneratingScreen.tsx` — accept optional `nodes` prop; render the new timeline when provided, fall back to the existing generic stepper when absent

## Files to create
- `src/components/reports/AgentTimeline.tsx` — new component that renders the 5-step timeline (checkmark / spinner / circle icons per step, elapsed seconds per row, friendly labels)
- `src/lib/agent-labels.ts` — map from internal agent names (e.g. `esg_harvester`) to user-friendly labels (e.g. `Harvesting ESG indicators`) and the canonical ordered list of expected nodes

## New dependencies
No new dependencies. Icons come from `lucide-react` (already installed — `CheckCircle`, `Loader2`, `Circle`, `XCircle`).

## Rules for implementation
- The expected list of 5 agents (`validate_file`, `data_extractor`, `esg_harvester`, `kpi_normalizer`, `save_to_db`) must be hard-coded on the frontend in `src/lib/agent-labels.ts` — do not dynamically derive from the response
- The timeline must always render all 5 rows from the start — missing agents show as `pending` (grey circle), never as errors
- Agent names must be shown with friendly labels, never with internal snake_case — use the mapping in `agent-labels.ts`
- The polling loop must fetch both endpoints in parallel via `Promise.all` — never serialize them; one slow endpoint should not delay the other
- If the nodes endpoint fails with a transient error, swallow it like the existing poll does — the timeline can stay stale for a tick, the main poll is authoritative for phase transitions
- The nodes endpoint is additive — the existing `GET /agent_runs/{run_id}` behavior, `phase` discriminated union, and all other hook outputs must stay backward compatible
- If the nodes endpoint returns empty (e.g., legacy pipelines from before the backend change), the frontend must render the 5-step timeline with all steps in `pending` state — no errors, no blank UI
- Running rows display their live `elapsed_seconds` from the backend response — the frontend must not compute elapsed time independently
- Completed rows display their final `elapsed_seconds` value formatted to one decimal (e.g. `4.2s`, not `4.234s`)
- Exactly one agent can be in `running` state at a time given the sequential pipeline — if two rows come back as running (edge case in multi-file uploads), show all running rows as running
- If a node comes back with `status: 'failed'`, that row shows a red X icon and the `error_message` as a tooltip or subline; subsequent expected nodes stay as `pending` (they never ran)
- The polling interval for nodes must match the pipeline-level polling interval (3 seconds currently) — do not introduce a second cadence
- Do not store node data in localStorage — only the existing `PipelineHandle` (runId + pollUrl) is persisted, nodes are always re-fetched on resume
- The existing timeout (30 minutes), "Keep waiting", completion handoff, error handling, and localStorage resume behavior must all continue to work unchanged
- When `phase === 'completed'` or `phase === 'failed'`, stop polling the nodes endpoint immediately — no final poll after the terminal state
- The nodes endpoint returns rows in `created_at ASC` order — do not re-sort on the frontend, render in the order received
- The timeline component must be presentational only — no fetching, no state, accept `nodes: AgentNode[]` as a prop

## Response shape (from backend — for reference only)

```json
{
  "run_id": "a14f9f87-...",
  "nodes": [
    {
      "agent_name": "validate_file",
      "status": "completed",
      "elapsed_seconds": 0.02,
      "created_at": "2026-04-22T09:02:34Z",
      "error_message": null
    },
    {
      "agent_name": "data_extractor",
      "status": "completed",
      "elapsed_seconds": 4.2,
      "created_at": "2026-04-22T09:02:34Z",
      "error_message": null
    },
    {
      "agent_name": "esg_harvester",
      "status": "running",
      "elapsed_seconds": 42.1,
      "created_at": "2026-04-22T09:02:38Z",
      "error_message": null
    }
  ]
}
```

## Agent label map (for reference — goes in `src/lib/agent-labels.ts`)

```ts
export const EXPECTED_AGENTS = [
  { key: 'validate_file',   label: 'Validating file' },
  { key: 'data_extractor',  label: 'Extracting content' },
  { key: 'esg_harvester',   label: 'Harvesting ESG indicators' },
  { key: 'kpi_normalizer',  label: 'Normalizing KPIs' },
  { key: 'save_to_db',      label: 'Saving to database' },
] as const;
```

The frontend iterates this list to render 5 rows. For each row, it looks up the matching entry in the `nodes` array from the backend response. If no match is found, the row renders as `pending`.

## Visual states per row

- **Pending** (no matching node in response) — grey circle icon (`Circle`), label in muted text, no elapsed time shown
- **Running** (`status: 'running'`) — blue spinner icon (`Loader2` with `animate-spin`), label in normal text, live elapsed time shown with trailing ellipsis (e.g. `42s...`)
- **Completed** (`status: 'completed'`) — green checkmark icon (`CheckCircle`), label in normal text, final elapsed time shown (e.g. `4.2s`)
- **Failed** (`status: 'failed'`) — red X icon (`XCircle`), label in normal text, error message shown below the label in red

## Definition of done
- [ ] `agentRuns.getNodes(runId, signal)` exists in `src/lib/api.ts` and is covered by types
- [ ] `AgentNode` and `AgentNodesResponse` types exist in `src/types/report.ts`
- [ ] `EXPECTED_AGENTS` list exists in `src/lib/agent-labels.ts` with all 5 agents in correct pipeline order
- [ ] `usePipelinePoll` fetches both the parent run endpoint and the nodes endpoint every 3 seconds via `Promise.all`
- [ ] `usePipelinePoll` exposes `nodes: AgentNode[]` alongside the existing `phase` / `run` / `elapsedMs` fields
- [ ] `AgentTimeline` component renders all 5 agent rows from `EXPECTED_AGENTS`, matching against the `nodes` prop
- [ ] Pending rows render with grey circle and muted text
- [ ] Running rows render with blue spinner and live elapsed time with ellipsis
- [ ] Completed rows render with green checkmark and final elapsed time formatted to one decimal
- [ ] Failed rows render with red X icon and error message below the label
- [ ] `GeneratingScreen` renders `AgentTimeline` when `nodes` prop is provided, falls back to the existing generic stepper when absent (keeps backward compatibility)
- [ ] `ProcessingPage` passes `poll.nodes` into `GeneratingScreen`
- [ ] When polling fails transiently on the nodes endpoint, the timeline stays on its last-known state and the next tick retries — no blank UI, no error crash
- [ ] Legacy runs (where backend returns empty `nodes: []`) render all 5 rows as pending with no errors
- [ ] On `phase === 'completed'`, polling stops immediately — no additional nodes fetch after the terminal tick
- [ ] On `phase === 'failed'`, polling stops immediately and the last-known timeline state remains visible so the user can see which agent failed
- [ ] The existing timeout (30 min), "Keep waiting" restart, localStorage resume, completion handoff, and partial-failure warning banner all continue to work unchanged
- [ ] Manual test: trigger a real upload on staging, watch the timeline populate step by step as each agent completes, verify elapsed times match backend traces
- [ ] Manual test: hit the "Keep waiting" CTA after a 30-minute timeout — the timeline continues to update correctly after restart
- [ ] Manual test: refresh the tab mid-pipeline — resume banner appears, clicking it restores polling, the timeline rebuilds from the latest backend state (not from localStorage)