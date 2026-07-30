// The browser's half of "pick up where you left off".
//
// The run list itself comes from GET /compliance/runs — the server owns which
// runs exist and what state they're in, and it is right where a locally cached
// status would be wrong: a 60–90s run usually finishes after the tab is closed.
//
// Two things the API genuinely cannot know are kept here:
//   • which screen the user had open for a run — that's browser state
//   • which finished runs they've dismissed from the shelf
//
// Both are hints. Losing them costs a little precision, never a run.

import type { RunListItem } from "@/types/compliance";

const SCREENS_KEY = "centriton_compliance_screens";
const DISMISSED_KEY = "centriton_compliance_dismissed";

// Long enough to survive a weekend; past that the hint is worth less than the
// storage it sits in.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECORDS = 50;

// Which screen of the wizard the user last had open for a run. "Where I left"
// means the gaps I was working through, not the top of the wizard.
export type ComplianceScreen = "running" | "review" | "gate";

interface ScreenHint {
  screen: ComplianceScreen;
  savedAt: number;
}

type ScreenHints = Record<string, ScreenHint>;

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / disabled — these are hints, never a blocker */
  }
}

function readHints(): ScreenHints {
  const all = readJson<ScreenHints>(SCREENS_KEY, {});
  const cutoff = Date.now() - MAX_AGE_MS;
  const fresh: ScreenHints = {};
  for (const [runId, hint] of Object.entries(all)) {
    if (hint?.screen && hint.savedAt > cutoff) fresh[runId] = hint;
  }
  return fresh;
}

export function rememberScreen(runId: string, screen: ComplianceScreen): void {
  if (!runId) return;
  const hints = readHints();
  hints[runId] = { screen, savedAt: Date.now() };
  // Newest first, trimmed — an unbounded map would grow for the life of the
  // browser profile.
  const trimmed = Object.entries(hints)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, MAX_RECORDS);
  writeJson(SCREENS_KEY, Object.fromEntries(trimmed));
}

export function screenHint(runId: string): ComplianceScreen | undefined {
  return readHints()[runId]?.screen;
}

// Dismissing is per-browser and deliberately not sent anywhere: it means "stop
// showing me this", not "delete it". The run stays in the API's history.
export function dismissRun(runId: string): void {
  const dismissed = readJson<string[]>(DISMISSED_KEY, []);
  if (dismissed.includes(runId)) return;
  writeJson(DISMISSED_KEY, [runId, ...dismissed].slice(0, MAX_RECORDS));
}

export function isDismissed(runId: string): boolean {
  return readJson<string[]>(DISMISSED_KEY, []).includes(runId);
}

// How a run in flight describes itself. Shared because the same run shows up on
// the set-up shelf and in the background dock at the same time, and one calling
// it "Validating…" while the other says something else would read as two
// different things happening. The surfaces style it differently — a gradient on
// a card, a coloured dot on a row — so only the words live here.
export const RUN_STATE_LABEL: Record<string, string> = {
  running: "Validating…",
  done: "Results ready",
  error: "Didn’t finish",
};

export function runStateLabel(status: string | undefined): string {
  return RUN_STATE_LABEL[status ?? ""] ?? RUN_STATE_LABEL.done;
}

// "GHG_Protocol" → "GHG Protocol". An uploaded run is titled with the filename
// the user chose, and filenames carry underscores where the name wants spaces.
// Hyphens are left alone: a period like "Q3-2025" reads correctly as it is, and
// plenty of report names are legitimately hyphenated.
export function runTitle(title: string | null | undefined): string {
  return (title ?? "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

// Everything these two need to decide where a run belongs. Narrower than
// RunListItem on purpose: the background watcher holds runs assembled from
// GET /runs/{id}, which carries no title, period or timestamps, and casting one
// into a RunListItem to ask this question would be a lie the compiler couldn't
// catch. A RunListItem still satisfies it structurally, so existing callers are
// unaffected.
export type RunRef = Pick<RunListItem, "run_id" | "status" | "certified">;

// Where Continue should land, from the server's state — with the local hint
// used only to choose between two screens that are both correct for a finished
// run. Status always comes from the API; the hint never overrides it.
export function runScreen(run: RunRef, hint = screenHint(run.run_id)): ComplianceScreen {
  // Still going, or dead: both belong on the progress screen, which is the one
  // that knows how to wait and how to explain a failure.
  if (run.status === "running" || run.status === "error") return "running";
  // Signed off — the gate screen is where the certificate lives.
  if (run.certified) return "gate";
  // Finished and unsigned: the results, unless they were mid-certification.
  return hint === "gate" ? "gate" : "review";
}

export function runHref(run: RunRef, screen = runScreen(run)): string {
  const base = `/compliance/runs/${encodeURIComponent(run.run_id)}`;
  if (screen === "running") return `${base}/running`;
  if (screen === "gate") return `${base}/gate`;
  return base;
}
