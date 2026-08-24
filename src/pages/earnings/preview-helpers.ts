import type { EarningsProducedSection } from '@/types/earnings';

// Pure content-shape helpers for the Preview screen. Section `content` arrives as a
// JSON string (table/kpi/cover) or plain prose (generate/template); we parse and
// dispatch at render time — never printing a raw JSON blob, never fabricating data.

export type LooseRow = Record<string, unknown>;
/** One column of a grid: the key its cells are matched on, and its heading. */
export interface MatrixColumn {
  key: string;
  label: string;
}

export interface NormTable {
  title?: string;
  rows: LooseRow[];
  /**
   * Set when the source printed this as a GRID — line items down the side,
   * categories across the top (Upstream / Downstream / Corporate). Rows then
   * carry `cells` keyed to these instead of a single value.
   */
  matrixColumns?: MatrixColumn[];
  /**
   * Set when the section prints named columns whose cells are keyed BY that name —
   * Consensus vs Actual's Line / Actual / Expected / Result. The shared exporter
   * calls the same thing `columns`, so screen and PDF read one shape.
   */
  columns?: string[];
}

/** A list of column names off the wire, keeping only real strings. */
function asStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return out.length ? out : undefined;
}

/** matrix_columns off the wire, keeping only entries that can address a cell. */
export function asMatrixColumns(raw: unknown): MatrixColumn[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cols = raw.filter(isRecord).flatMap((c) => {
    const key = asString(c.key);
    return key ? [{ key, label: asString(c.label) ?? key }] : [];
  });
  return cols.length ? cols : undefined;
}

/** A grid row's display value for one column, or null when it has none. */
export function matrixCell(row: LooseRow, key: string): string | null {
  const cells = row.cells;
  if (!Array.isArray(cells)) return null;
  for (const c of cells) {
    if (isRecord(c) && asString(c.key) === key) return asString(c.display) ?? null;
  }
  return null;
}

export function tryParseJson(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

export function isRecord(v: unknown): v is LooseRow {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

// First non-null value across alias keys (e.g. label|metric|name).
export function cell(r: LooseRow, ...keys: string[]): unknown {
  for (const k of keys) if (r[k] != null) return r[k];
  return null;
}

export function stringifyCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Normalise arbitrary parsed JSON into a list of { title?, rows[] } — copied from
// the quarterly SectionContent parser (module-private there), accepting every
// envelope shape: [{title, rows}], bare row array, {tables:[...]}, {title, rows},
// or a plain object → key/value rows.
export function normalizeTables(parsed: unknown): NormTable[] {
  if (parsed == null) return [];
  if (Array.isArray(parsed)) {
    if (parsed.length && isRecord(parsed[0]) && Array.isArray((parsed[0] as LooseRow).rows)) {
      return (parsed as LooseRow[]).map((t) => ({
        title: asString(t.title),
        rows: Array.isArray(t.rows) ? (t.rows as LooseRow[]) : [],
        matrixColumns: asMatrixColumns(t.matrix_columns),
        columns: asStringArray(t.columns),
      }));
    }
    return [{ rows: parsed.filter(isRecord) as LooseRow[] }];
  }
  if (isRecord(parsed)) {
    if (Array.isArray(parsed.tables)) {
      return (parsed.tables as LooseRow[]).map((t) => ({
        title: asString(t.title),
        rows: Array.isArray(t.rows) ? (t.rows as LooseRow[]) : [],
        matrixColumns: asMatrixColumns(t.matrix_columns),
        columns: asStringArray(t.columns),
      }));
    }
    if (Array.isArray(parsed.rows)) {
      return [{ title: asString(parsed.title), rows: parsed.rows as LooseRow[] }];
    }
    // `{title, entries:[{label, value}]}` envelope (e.g. Reporting Calendar / IR
    // Contact) → a label/value table, each entry a row.
    if (Array.isArray(parsed.entries)) {
      return [{ title: asString(parsed.title), rows: parsed.entries.filter(isRecord) as LooseRow[] }];
    }
    // Plain object → 2-column key/value table. `title` is a caption, not a row.
    return [
      {
        title: asString(parsed.title),
        rows: Object.entries(parsed)
          .filter(([k]) => k !== 'title')
          .map(([k, v]) => ({ label: k, current_display: stringifyCell(v) })),
      },
    ];
  }
  return [];
}

// Some narrative sections (Financial Review / MD&A, Executive Summary, Capital
// Allocation — written FROM the report's own figures) come back as a
// `{heading, content}` JSON envelope rather than bare prose: a heading line
// plus the actual paragraphs. Read it defensively so it renders as a proper
// heading + prose block. Without this, the parsed object falls into
// normalizeTables's generic "plain object → key/value table" branch and
// prints "heading" / "content" as two table rows instead of real text.
export interface NarrativeEnvelope {
  heading: string | null;
  body: string;
}

export function readNarrativeEnvelope(content: string): NarrativeEnvelope | null {
  const parsed = tryParseJson(content);
  if (!isRecord(parsed)) return null;
  const body = parsed.content;
  if (typeof body !== 'string' || body.trim() === '') return null;
  const heading = typeof parsed.heading === 'string' && parsed.heading.trim() !== '' ? parsed.heading : null;
  return { heading, body };
}

// A section the backend "produced" but with nothing to say — a fixed
// boilerplate sentence ("No forward-looking guidance was disclosed in the
// uploaded documents for this period.") rather than real prose. Confirmed
// live across multiple sections (Guidance/Outlook, Reporting Calendar/IR
// Contact) — the backend always closes this exact sentence with "in the
// uploaded documents for this period.", which a legitimate finding never
// would (this is a template tail, not organic writing). Matched narrowly —
// short, starts with "No", ends with the fixed tail — so real content that
// happens to start with "No" (e.g. "No dividends were declared this
// quarter, in line with the prior year.") is never swept up by mistake.
// TODO(backend): this is a stopgap. The real fix is a backend flag (see
// .claude/specs/Earnings/NoDataPlaceholder(Backend).md) so the frontend
// reads an explicit signal instead of pattern-matching the sentence — and so
// the EXPORTED PDF/DOCX (server-rendered, entirely out of the frontend's
// control) can also blank it, not just the Preview screen.
const NO_DATA_TAIL = /in the uploaded documents for this period\.?\s*$/i;

/**
 * The finding itself, when a section's only content is the backend's fixed
 * "nothing found" sentence — so Preview can SAY it rather than blank the section
 * and leave a Run button that can never succeed.
 *
 * This is a real answer ("your documents contain no forward-looking guidance"),
 * not a gap the user is expected to fill, and not a failure. The Report screen
 * still drops the section entirely (see isHiddenWhenOmitted) — a published
 * release does not carry a paragraph explaining what it does not say.
 */
export function noDataMessage(content: string | null): string | null {
  if (!isNoDataPlaceholder(content)) return null;
  const envelope = readNarrativeEnvelope(content as string);
  return (envelope ? envelope.body : (content as string)).trim();
}

export function isNoDataPlaceholder(content: string | null): boolean {
  if (!content) return false;
  const envelope = readNarrativeEnvelope(content);
  const text = (envelope ? envelope.body : content).trim();
  if (!text || text.length > 220 || text.includes('\n\n')) return false;
  return /^No\b/i.test(text) && NO_DATA_TAIL.test(text);
}

// ─── content-shape dispatch ───────────────────────────────────────────────────
export function isCoverMode(section: Pick<EarningsProducedSection, 'section_code' | 'mode'>): boolean {
  return section.mode === 'cover' || /cover/i.test(section.section_code);
}

// Trend (S16) reuses this table path entirely — no dedicated component.
export function isTableMode(section: Pick<EarningsProducedSection, 'mode'>): boolean {
  return section.mode === 'table' || section.mode === 'kpi' || section.mode === 'trend';
}

// A quote block: verbatim text + attribution.
//
// Matching on the section CODE as well was right when s05_management_commentary
// was Release/quote. D-31 moved it to AI-written/generate, producing through the
// shared RAG composer and storing {heading, content} -- so QuoteBlock found no
// `quote` key, returned null, and the CEO Commentary panel rendered completely
// blank. The mode is the only honest signal for what the content actually is.
export function isQuoteMode(section: Pick<EarningsProducedSection, 'mode' | 'section_code'>): boolean {
  return section.mode === 'quote';
}

// Non-IFRS reconciliation (S15) — reported → adjustments → adjusted, per line.
export function isReconciliationMode(
  section: Pick<EarningsProducedSection, 'mode' | 'section_code'>,
): boolean {
  return section.mode === 'reconciliation' || /reconciliation/i.test(section.section_code);
}

// Sections that vanish ENTIRELY (no card, no rail entry) when they produced
// nothing by design: quote (S05), trend (S16) — the spec's "doesn't appear"
// language is specific to these two — and any section whose only "content" is
// the backend's fixed "no data found" boilerplate sentence (see
// isNoDataPlaceholder). Reconciliation/KPI still render their (possibly
// all-gap) table — that's a real, structured "here's what's missing" view,
// not a placeholder sentence standing in for nothing.
export function isHiddenWhenOmitted(
  section: Pick<EarningsProducedSection, 'mode' | 'section_code' | 'content'>,
): boolean {
  return (
    isQuoteMode(section) ||
    section.mode === 'trend' ||
    /trend/i.test(section.section_code) ||
    isNoDataPlaceholder(section.content)
  );
}

export interface CoverValues {
  companyName: string | null;
  title: string | null;
  period: string | null;
  preparedOn: string | null;
  templateKey: string | null;
}

// Read the cover envelope { template_key, layout, values:{...} } defensively.
export function readCoverValues(
  content: string | null,
  fallbackTemplateKey: string | null,
): CoverValues {
  const parsed = content ? tryParseJson(content) : undefined;
  const o = isRecord(parsed) ? parsed : {};
  const values = isRecord(o.values) ? o.values : o;
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  return {
    companyName: str(values.company_name) ?? str(values.company),
    title: str(values.title),
    period: str(values.period_label) ?? str(values.period),
    preparedOn: str(values.prepared_on) ?? str(values.prepared_at),
    templateKey: str(o.template_key) ?? str(o.templateKey) ?? fallbackTemplateKey,
  };
}

// Honest render-state for an earnings produced section — derived from real content,
// not a blind status flag. Table/kpi with zero real (non-omitted) rows counts as
// omitted, not produced.
export type EarningsRenderState = 'produced' | 'needs_input' | 'pending' | 'omitted';

// ─── row-level three-state reading (D-12) ──────────────────────────────────────
// The same "a blank must read as what it is" rule, at line-item granularity —
// distinguishes a row still awaiting production, a specific gap (with a reason),
// and a row the backend omitted entirely. Field names unconfirmed (Step 0); read
// every plausible alias, never fabricate a status the payload doesn't carry.
export type RowBlankState = 'value' | 'pending' | 'gap' | 'omitted';

export function gapReason(row: LooseRow): string | null {
  const v = cell(row, 'gap_reason', 'gap_message');
  return typeof v === 'string' && v ? v : null;
}

export function rowBlankState(row: LooseRow): RowBlankState {
  const status = cell(row, 'row_status', 'status');
  if (status === 'omitted') return 'omitted';
  if (status === 'pending') return 'pending';
  if (status === 'gap' || gapReason(row) != null) return 'gap';
  const hasValue =
    stringifyCell(cell(row, 'current_display', 'current', 'value', 'reported_display', 'adjusted_display')) !== '';
  return hasValue ? 'value' : 'pending';
}

// Shared per-row citation text ("<label> · <ref>") — used by SectionTable and
// ReconciliationTable so the join logic lives in exactly one place.
export function rowCitation(row: LooseRow): string | null {
  const parts = [cell(row, 'source_label'), cell(row, 'source_ref', 'page')].filter(
    (v): v is string => typeof v === 'string' && v !== '',
  );
  return parts.length ? parts.join(' · ') : null;
}

function hasRealContent(
  section: Pick<EarningsProducedSection, 'content' | 'mode' | 'section_code'>,
): boolean {
  const c = section.content;
  if (c == null || c.trim() === '') return false;
  // A "no data found" boilerplate sentence isn't real content — without this,
  // a no-data section reads as 'produced' (it has non-empty text) instead of
  // 'omitted', which is what actually lets it vanish via isHiddenWhenOmitted.
  if (isNoDataPlaceholder(c)) return false;
  if (isTableMode(section)) {
    const parsed = tryParseJson(c);
    if (parsed === undefined) return true; // non-JSON but non-empty → treat as prose
    return normalizeTables(parsed).some((t) => t.rows.some((r) => rowBlankState(r) !== 'omitted'));
  }
  if (isQuoteMode(section)) {
    const parsed = tryParseJson(c);
    if (parsed === undefined) return true; // non-JSON but non-empty → treat as prose
    const q = isRecord(parsed) ? parsed : {};
    // 'content' is the `{heading, content}` envelope this section can also
    // arrive as — mirrors QuoteBlock's own alias list.
    const quote = cell(q, 'quote', 'text', 'content');
    return typeof quote === 'string' && quote.trim() !== '';
  }
  return true;
}

export function earningsSectionState(section: EarningsProducedSection): EarningsRenderState {
  if (hasRealContent(section)) return 'produced';
  if (
    section.status === 'needs_input' ||
    section.feeder_status === 'needs_input' ||
    section.feeder_status === 'external'
  ) {
    return 'needs_input';
  }
  if (section.status === 'pending') return 'pending';
  return 'omitted';
}
