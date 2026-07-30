import type { ProducedSection, OutlineSection } from '@/types/quarterly';

// Shared section-state logic used by both the Preview (section rail) and the
// Assembled Report (single document) screens. Pure functions — no UI.

// The cover section is rendered by CoverRenderer (design + brand), not the
// generic SectionContent. Detect it by section_code.
export function isCoverSection(s: Pick<ProducedSection, 'section_code'>): boolean {
  return /cover/i.test(s.section_code);
}

// The Table of Contents is generated from the finished document (source_type
// "Template", mode "auto"), so it has nothing to show or configure while the report
// is still being built. Hide it on Outline and Preview; it stays in the outline the
// backend saves and still appears in the assembled report.
//
// Matched on the exact code — a loose /toc/ test would not match this one anyway
// ("table_of_contents" contains no "toc"), and a substring match risks catching an
// unrelated future section.
export function isTableOfContentsSection(sectionCode: string): boolean {
  return sectionCode === 'table_of_contents';
}

// Ascending sort by display_order — the single source of section order shared by
// the Outline, Preview and Assembled-report screens (and honored by the backend
// export). Null/undefined orders coalesce to 0.
export function byDisplayOrder(
  a: Pick<ProducedSection | OutlineSection, 'display_order'>,
  b: Pick<ProducedSection | OutlineSection, 'display_order'>,
): number {
  return (a.display_order ?? 0) - (b.display_order ?? 0);
}

// Honest display state — derived from REAL content, never from a blind status
// flag. 'produced' requires actual content; empty tables / blank strings are NOT
// produced.
export type SectionState = 'produced' | 'needs_input' | 'empty';

// Both 'needs_input' and 'empty' (no-data) sections want the user to supply
// content — they render the same text + document-upload controls.
export const wantsInput = (state: SectionState): boolean =>
  state === 'needs_input' || state === 'empty';

// Count rows across whatever table JSON shape the backend returns.
export function tableRowCount(parsed: unknown): number {
  if (parsed == null) return 0;
  if (Array.isArray(parsed)) {
    if (parsed.length && typeof parsed[0] === 'object' && parsed[0] !== null && 'rows' in (parsed[0] as object)) {
      return (parsed as { rows?: unknown[] }[]).reduce((n, t) => n + (Array.isArray(t.rows) ? t.rows.length : 0), 0);
    }
    return parsed.length;
  }
  if (typeof parsed === 'object') {
    const o = parsed as { tables?: { rows?: unknown[] }[]; rows?: unknown[] };
    if (Array.isArray(o.tables)) return o.tables.reduce((n, t) => n + (Array.isArray(t.rows) ? t.rows.length : 0), 0);
    if (Array.isArray(o.rows)) return o.rows.length;
    return Object.keys(o).length;
  }
  return 0;
}

// The backend emits an "Awaiting input: <what's needed>" placeholder into the
// content of sections that still need the user to supply something — that is NOT
// produced content, even though it's a non-empty string.
export function awaitingInputText(s: ProducedSection): string | null {
  const c = (s.content ?? '').trim();
  const m = c.match(/^awaiting\s*input\s*[:-]?\s*(.*)$/i);
  return m ? m[1].trim() : null;
}

// The backend also emits "No figures/data available…" placeholders for sections
// that produced nothing — also NOT real content (they're empty, not produced).
export function isNoDataPlaceholder(content: string | null | undefined): boolean {
  const t = (content ?? '').trim().toLowerCase();
  if (!t) return false;
  return (
    /^no\s+(figures?|data|content|information|results?)\b/.test(t) ||
    t === 'n/a' ||
    t === 'not available'
  );
}

// True only when the section has real, non-empty content. Empty tables
// ({"rows": []}), blank strings, "Awaiting input: …" and "No data available…"
// placeholders do NOT count.
export function hasRealContent(s: ProducedSection): boolean {
  const c = s.content;
  if (c == null || c.trim() === '') return false;
  if (awaitingInputText(s) !== null) return false; // needs-input placeholder
  if (isNoDataPlaceholder(c)) return false; // no-data placeholder
  if (s.mode === 'table' || s.mode === 'kpi') {
    try {
      return tableRowCount(JSON.parse(c)) > 0;
    } catch {
      return true; // non-JSON but non-empty → treat as prose content
    }
  }
  return true;
}

// Message for the empty state — prefer the backend's own "No … available" text.
export function emptyMessage(s: ProducedSection): string {
  const c = (s.content ?? '').trim();
  return c && isNoDataPlaceholder(c) ? c : 'No data available for this section.';
}

export function needsInputSection(s: ProducedSection): boolean {
  return (
    awaitingInputText(s) !== null ||
    s.feeder_status === 'needs_input' ||
    s.feeder_status === 'external' ||
    (s.status as string) === 'needs_input'
  );
}

// What a needs-input section is waiting for — prefer the placeholder's own text
// (e.g. "Legal / regulatory boilerplate"), then the outline feeder message.
export function neededInput(s: ProducedSection): string {
  const fromPlaceholder = awaitingInputText(s);
  if (fromPlaceholder) return fromPlaceholder;
  return s.message || 'the required input for this section';
}

export function sectionState(s: ProducedSection): SectionState {
  if (hasRealContent(s)) return 'produced';
  if (needsInputSection(s)) return 'needs_input';
  return 'empty';
}

// Friendly source-type label (how the section is generated).
export function sourceTypeLabel(s: ProducedSection): string {
  const st = (s.source_type || '').toLowerCase();
  if (st.includes('extract')) return 'Extraction';
  if (st.includes('hybrid')) return 'Hybrid';
  if (st.includes('external')) return 'External';
  if (st.includes('template')) return 'Template';
  if (st.includes('generate') || st.includes('ai')) return 'AI-written';
  if (s.mode === 'generate') return 'AI-written';
  if (s.mode === 'table' || s.mode === 'kpi') return 'Extraction';
  if (s.mode === 'template') return 'Template';
  return s.source_type || 'Section';
}

// Map a locked OutlineSection into a seed ProducedSection (pre-production).
export function seedFromOutline(o: OutlineSection): ProducedSection {
  return {
    section_code: o.section_code,
    title: o.title,
    display_order: o.display_order ?? 0,
    source_type: o.source_type,
    mode: o.mode,
    status: 'pending',
    content: null,
    feeder_status: o.feeder.status,
    message: o.feeder.message,
  };
}
