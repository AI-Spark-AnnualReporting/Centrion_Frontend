import type { EarningsProducedSection } from '@/types/earnings';

// Pure content-shape helpers for the Preview screen. Section `content` arrives as a
// JSON string (table/kpi/cover) or plain prose (generate/template); we parse and
// dispatch at render time — never printing a raw JSON blob, never fabricating data.

export type LooseRow = Record<string, unknown>;
export interface NormTable {
  title?: string;
  rows: LooseRow[];
}

export function tryParseJson(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function isRecord(v: unknown): v is LooseRow {
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
      }));
    }
    return [{ rows: parsed.filter(isRecord) as LooseRow[] }];
  }
  if (isRecord(parsed)) {
    if (Array.isArray(parsed.tables)) {
      return (parsed.tables as LooseRow[]).map((t) => ({
        title: asString(t.title),
        rows: Array.isArray(t.rows) ? (t.rows as LooseRow[]) : [],
      }));
    }
    if (Array.isArray(parsed.rows)) {
      return [{ title: asString(parsed.title), rows: parsed.rows as LooseRow[] }];
    }
    // Plain object → 2-column key/value table.
    return [{ rows: Object.entries(parsed).map(([k, v]) => ({ label: k, current_display: stringifyCell(v) })) }];
  }
  return [];
}

// ─── content-shape dispatch ───────────────────────────────────────────────────
export function isCoverMode(section: Pick<EarningsProducedSection, 'section_code' | 'mode'>): boolean {
  return section.mode === 'cover' || /cover/i.test(section.section_code);
}

export function isTableMode(section: Pick<EarningsProducedSection, 'mode'>): boolean {
  return section.mode === 'table' || section.mode === 'kpi';
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
// not a blind status flag. Table/kpi with zero rows counts as empty, not produced.
export type EarningsRenderState = 'produced' | 'needs_input' | 'empty';

function hasRealContent(section: Pick<EarningsProducedSection, 'content' | 'mode'>): boolean {
  const c = section.content;
  if (c == null || c.trim() === '') return false;
  if (isTableMode(section)) {
    const parsed = tryParseJson(c);
    if (parsed === undefined) return true; // non-JSON but non-empty → treat as prose
    return normalizeTables(parsed).some((t) => t.rows.length > 0);
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
  return 'empty';
}
