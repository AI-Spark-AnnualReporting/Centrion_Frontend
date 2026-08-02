// Pure helpers for the Board of Directors' Report builder. No UI, no fetching —
// everything here is a transformation between an API payload and what a screen
// needs, kept out of the page so it can be tested directly.
//
// The section registry and the profile→section resolution used to live on the
// client. They are the server's now (`GET /outline`), so what's left is the
// small set of places where the client can silently corrupt or discard server
// data: seeding a profile, choosing a step, and serialising the outline.

import { ApiError } from '@/lib/api';
import type { AgentRun } from '@/types/report';
import type {
  BoardAssembledSection,
  BoardCompletion,
  BoardIssuerProfile,
  BoardOutlineSection,
  BoardOutlineSavePayload,
  BoardProduceSummary,
  BoardReportSummary,
  BoardSection,
  BoardSourcesResponse,
} from '@/types/board';
import type { ProducedSection } from '@/types/quarterly';

/** The two issuer pills. `insurer` is a valid API value but never offered. */
export const ISSUER_TYPES: { value: BoardIssuerProfile['issuer_type']; label: string }[] = [
  { value: 'bank', label: 'Bank (SAMA-regulated)' },
  { value: 'corporate', label: 'Non-financial (corporate)' },
];

/** Field-by-field equality, so an unchanged profile skips the PATCH. */
export const sameProfile = (a: BoardIssuerProfile | null, b: BoardIssuerProfile | null): boolean =>
  !!a && !!b && (Object.keys(a) as (keyof BoardIssuerProfile)[]).every((k) => a[k] === b[k]);

// ─── seeding a profile from the company record ────────────────────────────────

/**
 * The issuer profile implied by the company's onboarding answers. `POST /reports`
 * takes an optional `issuer_profile`, and seeding it is why the operator doesn't
 * re-answer sector / Shariah / sukuk on every report.
 *
 * Two fields are deliberately never guessed:
 *   - `sector` — it decides the fines regulator, so an unknown one stays null and
 *     the operator picks from the sectors lookup.
 *   - `externally_rated` — onboarding doesn't capture credit ratings, and guessing
 *     would silently add or drop the Credit ratings section.
 *
 * `insurer` is never emitted: the builder offers two issuer pills, so an insurance
 * company is sent as `corporate`. See the plan's backend questions.
 *
 * `sectorName` is the company's resolved sector — the `sector_name` join, or the
 * name looked up from `sector_id`. Sent to the API verbatim.
 */
export function profileFromCompany(
  c: {
    reporting_sector?: string | null;
    sector_name?: string | null;
    is_shariah?: boolean | null;
    has_sukuk?: boolean | null;
  },
  sectorName?: string | null,
): BoardIssuerProfile {
  const name = sectorName ?? c.sector_name ?? '';
  // reporting_sector is the authority on bank-vs-not; fall back to the sector
  // name only when onboarding never set it.
  const isBank = c.reporting_sector === 'bank' || (!c.reporting_sector && /\bbank/i.test(name));
  return {
    issuer_type: isBank ? 'bank' : 'corporate',
    sector: name || null,
    sharia_compliant: c.is_shariah ?? false,
    externally_rated: false,
    has_capital_instruments: c.has_sukuk ?? false,
  };
}

// ─── where to drop the operator on open ───────────────────────────────────────

export const BOARD_STEPS = ['Profile', 'Sources', 'Sections', 'Report'] as const;
export const BOARD_LAST_STEP = BOARD_STEPS.length;

/**
 * Which step a report should open on. Reopening a half-built report must not
 * dump the operator back on Profile — pick the furthest step its server state
 * justifies.
 */
export function initialStep(
  report: Pick<BoardReportSummary, 'status'> | null,
  sources: Pick<BoardSourcesResponse, 'slots'> | null,
  outline: Pick<BoardOutlineSection, 'status'>[] | null,
): number {
  if (report && report.status !== 'draft') return 4;
  if (outline?.some((s) => s.status === 'produced' || s.status === 'locked')) return 4;
  const required = sources?.slots.filter((s) => s.required) ?? [];
  if (required.length > 0 && required.every((s) => s.status === 'received')) return 3;
  return 1;
}

export const isBoardLocked = (status: string | null | undefined): boolean =>
  !!status && status !== 'draft';

// ─── outline ──────────────────────────────────────────────────────────────────

/**
 * The outline as `PUT /outline` wants it. Array order IS display order.
 *
 * Every section is sent, including `dropped`/`na` ones at `included: false` —
 * that's a no-op server-side (no state change, so no 422) and avoids relying on
 * undocumented semantics for sections omitted from the payload.
 */
export function outlinePayload(sections: BoardOutlineSection[]): BoardOutlineSavePayload {
  return { sections: sections.map((s) => ({ section_code: s.section_code, included: s.included })) };
}

export const isBoardExcluded = (s: Pick<BoardOutlineSection, 'resolution'>): boolean =>
  s.resolution === 'dropped' || s.resolution === 'na';

// ─── rendering ────────────────────────────────────────────────────────────────

/**
 * The cover is rendered by CoverRenderer, not the generic section renderer.
 *
 * `isCoverSection` from the quarterly helpers can't be used here — it tests
 * /cover/i against the section_code, and the board cover's code is BR01. Detect
 * it by its payload instead: a cover's content is `{template_key, values}`,
 * which would otherwise fall through to the key/value table branch.
 */
export function isBoardCoverSection(s: { section_code: string; content?: string | null }): boolean {
  if (s.section_code === 'BR01') return true;
  if (!s.content) return false;
  try {
    const parsed = JSON.parse(s.content) as Record<string, unknown>;
    return typeof parsed?.template_key === 'string';
  } catch {
    return false;
  }
}

/**
 * Adapt an assembled or produced board section to the shape the shared
 * renderers (`SectionContent` / `EditableSectionContent`) read. Content arrives
 * as a string, but normalise defensively — /assemble may hand back table content
 * already parsed.
 */
export function toBoardProduced(
  s: BoardAssembledSection | BoardSection,
  mode?: string,
): ProducedSection {
  const raw = s.content as unknown;
  const content = raw == null ? null : typeof raw === 'string' ? raw : JSON.stringify(raw);
  return {
    section_code: s.section_code,
    title: s.title,
    display_order: s.display_order ?? 0,
    source_type: 'source_type' in s ? (s.source_type ?? '') : '',
    // /assemble sends `mode`; /sections doesn't, so the caller derives one.
    mode: ('mode' in s ? s.mode : undefined) ?? mode ?? inferBoardMode(content),
    status: 'done',
    content,
    feeder_status: 'ready',
  };
}

/**
 * `GET /sections` carries no `mode`, but the renderers branch on it. Sniff the
 * content: table payloads are JSON objects carrying `rows`/`tables`; everything
 * else is prose.
 */
export function inferBoardMode(content: string | null): 'table' | 'prose' {
  if (!content) return 'prose';
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.rows) || Array.isArray(parsed.tables)) return 'table';
    }
  } catch {
    /* plain prose */
  }
  return 'prose';
}

// ─── async runs ───────────────────────────────────────────────────────────────

const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The batch-produce counters out of an agent run's `output_summary`, which is
 * untyped and unversioned. Read once here so a shape change degrades to "no
 * counter" in one place rather than throwing at each use.
 */
export function boardProduceSummary(run: AgentRun | null): BoardProduceSummary | null {
  const s = run?.output_summary as unknown;
  if (!isRec(s)) return null;
  const total = num(s.total);
  const produced = num(s.produced);
  if (total == null || produced == null) return null;
  return { produced, total, skipped: num(s.skipped) ?? 0, failed: num(s.failed) ?? 0 };
}

// ─── error bodies ─────────────────────────────────────────────────────────────

function pick(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) if (typeof o[k] === 'string' && o[k]) return o[k] as string;
  return null;
}

/**
 * A 409 from `POST /reports` — an unfinished report already exists for this
 * company and year. The body shape isn't fixed, so read it defensively.
 */
export function readBoardConflict(err: ApiError): { message: string; reportId: string | null } {
  const body = (err.body ?? {}) as Record<string, unknown>;
  const detail = body.detail;
  const detailObj = isRec(detail) ? detail : {};
  const reportId =
    pick(detailObj, 'existing_report_id', 'report_id', 'id') ??
    pick(body, 'existing_report_id', 'report_id', 'id');
  const message =
    (typeof detail === 'string' ? detail : pick(detailObj, 'message')) ??
    'A board report already exists for this financial year.';
  return { message, reportId };
}

/**
 * A 422 from the upload endpoint: the same document content was filed under
 * more than one slot. Returns the message to show and the slot names to
 * highlight, so the operator can see which rows to fix rather than re-reading
 * every one of them.
 */
export function readDuplicateSlots(err: unknown): { message: string; slots: string[] } | null {
  if (!(err instanceof ApiError) || err.status !== 422) return null;
  const body = (err.body ?? {}) as Record<string, unknown>;
  const detail = isRec(body.detail) ? body.detail : body;
  const dupes = Array.isArray(detail.duplicates) ? detail.duplicates : null;
  if (!dupes) return null;
  const slots = Array.from(
    new Set(
      dupes.flatMap((d) =>
        isRec(d) && Array.isArray(d.slots) ? d.slots.filter((x): x is string => typeof x === 'string') : [],
      ),
    ),
  );
  const message =
    pick(detail, 'error', 'message') ??
    'The same document was attached to more than one slot.';
  return { message, slots };
}

/** The run id out of a 409 from the upload endpoint, so the UI can adopt it. */
export function readExistingRunId(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = (err.body ?? {}) as Record<string, unknown>;
  const detail = body.detail;
  const detailObj = isRec(detail) ? detail : {};
  return pick(detailObj, 'existing_run_id', 'run_id') ?? pick(body, 'existing_run_id', 'run_id');
}

/**
 * `POST /approve` 409s while the report isn't ready, and the error body IS the
 * completion payload — so the dialog can list exactly what's missing without a
 * second request.
 */
export function readCompletionFromError(err: unknown): BoardCompletion | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = (err.body ?? {}) as Record<string, unknown>;
  const candidate = isRec(body.detail) ? body.detail : body;
  if (num(candidate.total) == null || num(candidate.ready) == null) return null;
  const codes = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    total: num(candidate.total) as number,
    ready: num(candidate.ready) as number,
    awaiting_data: codes(candidate.awaiting_data),
    pending_confirmation: codes(candidate.pending_confirmation),
    not_produced: codes(candidate.not_produced),
    can_approve: candidate.can_approve === true,
  };
}

/** Best-effort message out of any thrown error. */
export const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;
