import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ProducedSection } from '@/types/quarterly';
import type { DocumentBankResponse } from '@/types/report';
import { documents } from '@/lib/api';
import { asStringArray, isDataImage } from '@/components/quarterly/sectionState';
// One shared rule for reading a figure's units, also used by the extraction screen
// and mirrored in report_export.py — the screen and the download must agree.
import { deriveUnits, gridValue, unitsCaption } from './figureUnits';
// Likewise for the Analyse button's commentary: bullets or legacy paragraphs, one
// rule, mirrored in section_analysis.py and report_export.py.
import { splitAnalysis } from './analysisText';

// ─── colours (match Coverage / Gaps / Preview conventions) ────────────────────
const GREEN = '#10B981';
const RED = '#EF4444';
const MUTED = '#6B7280';
const DARK = '#1F2340';
const MONO = "'DM Mono', 'Courier New', monospace";
// Report-content accent — the chosen brand color (falls back to app indigo when
// no --brand-primary is set on an ancestor). Applies to headings, table headers,
// and KPI/highlight numbers only; body/label text stays dark.
const BRAND = 'var(--brand-primary, #4040C8)';

// Section content is stored keyed by `mode`:
//   table / kpi  → a JSON string that must be parsed and rendered as a real table
//   generate     → analytical prose
//   template     → filled boilerplate prose
// This renderer branches on mode and NEVER prints a raw JSON blob.
export function SectionContent({
  section,
  showAnalysis = false,
  companyId,
}: {
  section: ProducedSection;
  // The Analyse button's commentary, printed under the table(s) — it is part of
  // the report. Off by default because on Preview the SectionAnalysis control
  // renders it instead, so it can own the edit state; the read-only report view
  // turns it on.
  showAnalysis?: boolean;
  // Needed only for mode 'attach' sections, to resolve a fresh signed download
  // URL for the "View PDF" button on demand. Omit where unavailable — the
  // section still renders, just without a way to open the file.
  companyId?: string | null;
}) {
  const analysis = showAnalysis ? (section.analysis?.text ?? '').trim() : '';
  const body = <SectionBody section={section} companyId={companyId} />;
  if (!analysis) return body;
  return (
    <>
      {body}
      <AnalysisText text={analysis} />
    </>
  );
}

// Typed on the two fields it actually reads, so the reviewer view can pass the
// same section it holds for the earnings renderer without a cast.
function SectionBody({
  section,
  companyId,
}: {
  section: Pick<ProducedSection, 'mode' | 'content'>;
  companyId?: string | null;
}) {
  const { mode } = section;
  // Some endpoints (e.g. /assemble) return table content as a parsed object/array
  // rather than a JSON string. Normalise to a string so `.trim()`/JSON.parse work.
  const raw = section.content as unknown;
  const content = raw == null ? null : typeof raw === 'string' ? raw : JSON.stringify(raw);

  if (content == null || content.trim() === '') {
    return <NoData />;
  }

  const parsed = tryParseJson(content);

  // Attach-mode content is never text — `{document_id}` embedding a PDF
  // verbatim. Branch before any of the prose/table shape-detection below,
  // which would otherwise print the raw JSON as a blob.
  if (mode === 'attach') {
    const documentId = isRecord(parsed) ? asString(parsed.document_id) : undefined;
    // Keyed on documentId so replacing the file resets any stale error/loading
    // state left over from viewing the one it replaced.
    return documentId ? <AttachedPdf key={documentId} documentId={documentId} companyId={companyId} /> : <NoData />;
  }

  // Structured sections (a table and/or a narrative in one JSON payload —
  // {rows, analysis} for hybrid table+analysis, {heading, content} for a
  // sub-headed narrative) report mode 'generate'/'template', not 'table'/
  // 'kpi' — detect the shape itself rather than trusting `mode`, so it
  // renders as a heading + table + prose instead of a raw blob.
  const hasStructuredShape =
    isRecord(parsed) &&
    (Array.isArray(parsed.rows) || Array.isArray(parsed.tables) || parsed.analysis != null || parsed.content != null || parsed.heading != null);
  if (hasStructuredShape && isRecord(parsed)) {
    // Only actually build a table when a table shape is present — otherwise
    // normalizeTables()'s "plain object → key/value rows" fallback would turn
    // e.g. {heading, content} itself into a bogus 2-row table.
    const hasTableShape = Array.isArray(parsed.rows) || Array.isArray(parsed.tables);
    const tables = hasTableShape ? normalizeTables(parsed) : [];
    const heading = asString(parsed.heading);
    // An array-shaped analysis/content is a list of discrete points, not
    // flowing prose — render those as bullets. A plain string is real prose
    // (its own \n\n breaks are paragraphs, not separate points).
    const narrativeItems = asProseItems(parsed.analysis) ?? asProseItems(parsed.content);
    const narrativeText = asString(parsed.analysis) ?? asString(parsed.content);
    if (tables.some((t) => t.rows.length > 0) || narrativeItems || narrativeText || heading) {
      return (
        <>
          {heading && (
            <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: BRAND }}>{heading}</h3>
          )}
          {tables.map((t, i) => (
            <TableBlock key={i} table={t} showTitle={tables.length > 1} />
          ))}
          {narrativeItems ? <Bullets items={narrativeItems} /> : narrativeText && <MarkdownProse text={narrativeText} />}
        </>
      );
    }
  }

  const isTabular = mode === 'table' || mode === 'kpi';
  if (isTabular) {
    if (parsed !== undefined) {
      const tables = normalizeTables(parsed);
      if (tables.some((t) => t.rows.length > 0)) {
        return (
          <>
            {tables.map((t, i) => (
              <TableBlock key={i} table={t} showTitle={tables.length > 1} />
            ))}
          </>
        );
      }
      // Valid table JSON but no rows ({"rows": []}) → empty, never a blob.
      return <NoData />;
    }
    // Not valid JSON — treat the string as prose.
    return <MarkdownProse text={content} />;
  }

  // generate / template / anything else → prose.
  return <MarkdownProse text={content} />;
}

// Honest empty state — shown when a section produced no usable content.
function NoData() {
  return (
    <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No data available for this section.</p>
  );
}

// Attach-mode content — a PDF embedded verbatim, identified only by
// document_id. Looks up its filename + signed download_url once on mount
// (documents.byReport is the same proven source the Document Bank reads
// download_url from — a plain GET-by-id endpoint for a single document isn't
// confirmed to exist, so this asks the source that's known to work).
function AttachedPdf({ documentId, companyId }: { documentId: string; companyId?: string | null }) {
  const [doc, setDoc] = useState<{ filename?: string; download_url?: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    documents
      .byReport<DocumentBankResponse>(companyId)
      .then((res) => {
        if (cancelled) return;
        const found = res.reports.flatMap((r) => r.documents).find((d) => d.id === documentId);
        if (found) setDoc(found);
        else setError('This file is no longer available.');
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this file.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, documentId]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, border: '1px solid #E4E6F1', background: '#FAFAFD' }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
          <path d="M12 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6z" stroke={BRAND} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M12 2v4h4" stroke={BRAND} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {loading ? 'Loading…' : doc?.filename || 'PDF attached'}
          </div>
          <div style={{ fontSize: 11.5, color: MUTED }}>Embedded as-is for this section.</div>
        </div>
        {companyId && (
          <button
            type="button"
            onClick={() => doc?.download_url && window.open(doc.download_url, '_blank', 'noopener,noreferrer')}
            disabled={loading || !doc?.download_url}
            style={{
              fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 7,
              color: '#fff', background: BRAND, border: 'none',
              cursor: loading || !doc?.download_url ? 'default' : 'pointer',
              opacity: loading || !doc?.download_url ? 0.6 : 1, flexShrink: 0,
            }}
          >
            View PDF
          </button>
        )}
      </div>
      {error && <div style={{ marginTop: 8, fontSize: 12, color: RED }}>{error}</div>}
    </div>
  );
}

// ─── prose ────────────────────────────────────────────────────────────────────
// Board narrative content is lifted verbatim out of the source document, which
// means it arrives as Markdown — headings, bullets, GFM tables. Rendered as
// plain text it reads as "## Heading" and "| a | b |". Off by default so the
// quarterly and earnings payloads, which are plain prose, are untouched.
export function MarkdownProse({ text }: { text: string }) {
  return (
    <div className="md-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{expandInlineBullets(text)}</ReactMarkdown>
    </div>
  );
}

// Source extraction sometimes flattens a real bullet list into one line with
// "•" as an inline separator ("Principal risk categories • Commodity price
// and market volatility • Geopolitical risk...") instead of actual line
// breaks — so it renders as a run-on sentence with literal bullet characters
// rather than a list. Rewrite any such line (2+ "•" separators, so a single
// stray bullet in normal prose is left alone) into a real nested Markdown
// list: the text before the first "•" stays as the item's lead-in, each
// segment after becomes its own indented "- " bullet nested under it.
function expandInlineBullets(text: string): string {
  return text
    .split('\n')
    .flatMap((line) => {
      const m = line.match(/^(\s*(?:\d+[.)]|[-*])\s+)(.*)$/);
      if (!m) return [line];
      const [, prefix, rest] = m;
      if (!rest.includes('•')) return [line];
      const parts = rest
        .split('•')
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length < 3) return [line];
      const [lead, ...bullets] = parts;
      const indent = ' '.repeat(prefix.length);
      return [`${prefix}${lead}`, '', ...bullets.map((b) => `${indent}- ${b}`), ''];
    })
    .join('\n');
}

// Exported so the Preview's SectionAnalysis prints its paragraphs in exactly the
// same type as the report page does — the same prose must not shift between the
// two screens.
export function Prose({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const blocks = paragraphs.length ? paragraphs : [text];
  return (
    <>
      {blocks.map((p, i) => (
        <p
          key={i}
          style={{ margin: i === 0 ? 0 : '14px 0 0', fontSize: 14, lineHeight: 1.75, color: '#2A2E47', whiteSpace: 'pre-wrap', textAlign: 'justify' }}
        >
          {p}
        </p>
      ))}
    </>
  );
}

// A discrete list of points (e.g. a hybrid table section's per-point
// analysis) — one bullet per item, not justified paragraph blocks.
// The Analyse button's commentary, in whichever shape it was written: the bullet
// list it writes now, or the blank-line paragraphs it wrote before the format
// changed (and that a hand-edit can still produce). Those were never migrated, so
// one report can hold both — see analysisText.ts for the rule, which the two
// exporters mirror so the download cannot disagree with the screen.
//
// Deliberately hands `Prose` the RAW text rather than the split items, so the
// legacy path keeps Prose's own paragraph splitting and pre-wrap behaviour exactly
// as it was.
export function AnalysisText({ text }: { text: string }) {
  const { kind, items } = splitAnalysis(text);
  return kind === 'bullets' ? <Bullets items={items} /> : <Prose text={text} />;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            marginTop: i === 0 ? 0 : 10, fontSize: 14, lineHeight: 1.75, color: '#2A2E47',
          }}
        >
          <span style={{ flexShrink: 0, marginTop: 10, width: 5, height: 5, borderRadius: '50%', background: BRAND }} />
          <span style={{ whiteSpace: 'pre-wrap' }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── table ────────────────────────────────────────────────────────────────────
type LooseRow = Record<string, unknown>;
// One prior period a comparison table compares against (YoY/QoQ). `key` is
// "yoy"/"qoq"; `label` is the human period, e.g. "Q3 2024".
interface ComparePeriod {
  key: string;
  label: string;
}
interface NormTable {
  title?: string;
  rows: LooseRow[];
  // Explicit column list AND order, for tables whose shape varies per section
  // (governance grids: director profiles, remuneration, meeting attendance —
  // which grows a column per meeting held). Absent → derived from the row keys.
  // Its presence also means the table is NOT a financial statement.
  columns?: string[];
  comparePeriods?: ComparePeriod[]; // present → render one value+change column per period
  currentLabel?: string | null; // header for the current column, e.g. "Q3 2025"
  // present → the source printed this section as a GRID (a note schedule: line items
  // down the side, categories across the top). One column per category, read from
  // each row's `cells`, and no change column — categories aren't comparable.
  matrixColumns?: ComparePeriod[];
}

function normalizeComparePeriods(v: unknown): ComparePeriod[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter(isRecord)
    .map((p) => ({ key: asString(p.key) ?? '', label: asString(p.label) ?? '' }))
    .filter((p) => p.label);
  return out.length ? out : undefined;
}

function tryParseJson(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// Normalise arbitrary parsed JSON into a list of { title?, rows[] }.
function normalizeTables(parsed: unknown): NormTable[] {
  if (parsed == null) return [];
  if (Array.isArray(parsed)) {
    if (parsed.length && isRecord(parsed[0]) && Array.isArray((parsed[0] as LooseRow).rows)) {
      return (parsed as LooseRow[]).map((t) => ({
        title: asString(t.title),
        rows: Array.isArray(t.rows) ? (t.rows as LooseRow[]) : [],
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
        columns: asStringArray(t.columns),
        // Per table, not per section: a sheet that stacked a grid and a list gives
        // them different columns, and dropping these rendered the grid as a bare
        // label/value pair with its categories gone.
        comparePeriods: normalizeComparePeriods(t.compare_periods),
        currentLabel: asString(t.current_label) ?? null,
        matrixColumns: normalizeComparePeriods(t.matrix_columns),
      }));
    }
    if (Array.isArray(parsed.rows)) {
      return [{
        title: asString(parsed.title),
        rows: parsed.rows as LooseRow[],
        columns: asStringArray(parsed.columns),
        comparePeriods: normalizeComparePeriods(parsed.compare_periods),
        currentLabel: asString(parsed.current_label) ?? null,
        matrixColumns: normalizeComparePeriods(parsed.matrix_columns),
      }];
    }
    // Plain object → key/value pairs as a 2-column table.
    return [{ rows: Object.entries(parsed).map(([k, v]) => ({ label: k, current_display: stringifyCell(v) })) }];
  }
  return [];
}

function TableBlock({ table, showTitle }: { table: NormTable; showTitle: boolean }) {
  const rows = table.rows;

  // A grid states its currency once above the table and drops it from every cell —
  // eight categories all repeating "SAR …M" is what made a note schedule unreadable
  // (and, in the PDF, too wide to fit the page). Grids only: a flat statement keeps
  // its per-row currency. deriveUnits returns null when the cells don't agree, and
  // then nothing is stripped and no claim is made.
  const units = useMemo(() => {
    if (!table.matrixColumns?.length) return null;
    return deriveUnits(
      rows.flatMap((r) => {
        const cells = cell(r, 'cells');
        return Array.isArray(cells)
          ? (cells as unknown[]).map((c) => (isRecord(c) ? asString(c.display) : null))
          : [];
      }),
    );
  }, [rows, table.matrixColumns]);

  if (rows.length === 0) return null;

  // Financial shape (label + current_display[/prior/change]) vs generic object rows.
  // An explicit column list settles it: only grids carry one, so a grid with a
  // column literally named "value" can't be misread as a financial statement.
  const financial =
    !table.columns && rows.some((r) => cell(r, 'current_display', 'current', 'value') != null);

  return (
    <div style={{ marginBottom: 24, overflowX: 'auto' }}>
      {showTitle && table.title && (
        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: BRAND }}>{table.title}</h3>
      )}
      {units && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: MUTED }}>{unitsCaption(units)}</p>
      )}
      {financial ? (
        <FinancialTable
          rows={rows}
          comparePeriods={table.comparePeriods}
          currentLabel={table.currentLabel}
          matrixColumns={table.matrixColumns}
          currency={units?.currency}
        />
      ) : (
        <GenericTable rows={rows} columns={table.columns} />
      )}
    </div>
  );
}

const TH: React.CSSProperties = {
  padding: '8px 10px',
  whiteSpace: 'nowrap',
  color: BRAND, // table-header row → brand accent
  fontWeight: 700,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

// Header label for a compare period's change column, e.g. "YoY %" / "QoQ %".
function changeHeader(key: string): string {
  if (key === 'yoy') return 'YoY %';
  if (key === 'qoq') return 'QoQ %';
  return `${key.toUpperCase()} %`;
}
// A row's comparison entry for a given period key (from the row's `comparisons`).
function compFor(r: LooseRow, key: string): LooseRow | undefined {
  const arr = cell(r, 'comparisons');
  if (!Array.isArray(arr)) return undefined;
  return (arr as unknown[]).find((c) => isRecord(c) && c.key === key) as LooseRow | undefined;
}

// A row's grid cell for a category key (from the row's `cells`).
function cellFor(r: LooseRow, key: string): string {
  const arr = cell(r, 'cells');
  if (!Array.isArray(arr)) return '';
  const hit = (arr as unknown[]).find((c) => isRecord(c) && c.key === key);
  return (isRecord(hit) ? asString(hit.display) : '') ?? '';
}

function FinancialTable({
  rows,
  comparePeriods,
  currentLabel,
  matrixColumns,
  currency,
}: {
  rows: LooseRow[];
  comparePeriods?: ComparePeriod[];
  currentLabel?: string | null;
  matrixColumns?: ComparePeriod[];
  // Set only for a grid whose cells agree on one currency — the caption above the
  // table then states it, and each cell drops it.
  currency?: string;
}) {
  // A grid wins over a comparison: eight categories times two periods is not a table
  // anyone can read, and a section printed as a grid is not comparing.
  const matrix = matrixColumns ?? [];
  const compare = matrix.length ? [] : comparePeriods ?? [];
  const hasCompare = compare.length > 0;
  // Legacy single-prior columns only when there's no per-period comparison data
  // (older produced content / sections that don't compare) — unchanged behavior.
  const showPrior = !hasCompare && rows.some((r) => cell(r, 'prior_display', 'prior') != null);
  const showChange = !hasCompare && rows.some((r) => cell(r, 'change_pct', 'change') != null);
  const currentHeader = currentLabel || 'Current';
  // A grid has no "Current" column of its own — every column is a category.
  const colCount = matrix.length
    ? 1 + matrix.length
    : 2 + (hasCompare ? compare.length * 2 : (showPrior ? 1 : 0) + (showChange ? 1 : 0));

  const cellPad = { padding: '9px 10px' } as const;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: `2px solid ${BRAND}` }}>
          <th style={{ ...TH, textAlign: 'left' }}>Metric</th>
          {!matrix.length && <th style={{ ...TH, textAlign: 'right' }}>{currentHeader}</th>}
          {matrix.length > 0 &&
            matrix.map((c) => (
              <th key={`m-${c.key}`} style={{ ...TH, textAlign: 'right' }}>{c.label}</th>
            ))}
          {hasCompare
            ? compare.flatMap((p) => [
                <th key={`v-${p.key}`} style={{ ...TH, textAlign: 'right' }}>{p.label}</th>,
                <th key={`c-${p.key}`} style={{ ...TH, textAlign: 'right' }}>{changeHeader(p.key)}</th>,
              ])
            : [
                showPrior ? <th key="prior" style={{ ...TH, textAlign: 'right' }}>Prior</th> : null,
                showChange ? <th key="change" style={{ ...TH, textAlign: 'right' }}>Change</th> : null,
              ]}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          // role: header | line | subtotal | total; indent: 0/1/2 (see statement_layout.py).
          // Rows without these keys (old content) render as plain lines — unchanged.
          const role = String(cell(r, 'role') ?? 'line');
          const indent = Number(cell(r, 'indent') ?? 0) || 0;

          // Group header — a bold brand label spanning the row, no value.
          if (role === 'header') {
            return (
              <tr key={i}>
                <td
                  colSpan={colCount}
                  style={{
                    padding: '16px 10px 6px', color: BRAND, fontWeight: 800, fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid #EDEEF3',
                  }}
                >
                  {stringifyCell(cell(r, 'label', 'metric', 'name'))}
                </td>
              </tr>
            );
          }

          const isTotal = role === 'total' || role === 'subtotal';
          const topBorder = isTotal ? '1px solid #D6D8E0' : undefined;
          return (
            <tr key={i} style={{ borderBottom: '1px solid #F1F2F6' }}>
              <td style={{
                ...cellPad, paddingLeft: 10 + indent * 18, color: DARK,
                fontWeight: isTotal ? 700 : 400, borderTop: topBorder,
              }}>
                {stringifyCell(cell(r, 'label', 'metric', 'name'))}
              </td>
              {!matrix.length && (
                <td style={{
                  ...cellPad, textAlign: 'right', fontFamily: MONO, color: BRAND,
                  fontWeight: 700, borderTop: topBorder,
                }}>
                  {stringifyCell(cell(r, 'current_display', 'current', 'value'))}
                </td>
              )}
              {matrix.length > 0 &&
                matrix.map((c) => (
                  <td key={`m-${c.key}`} style={{
                    ...cellPad, textAlign: 'right', fontFamily: MONO, color: BRAND,
                    fontWeight: isTotal ? 700 : 400, borderTop: topBorder,
                  }}>
                    {gridValue(cellFor(r, c.key), currency)}
                  </td>
                ))}
              {hasCompare
                ? compare.flatMap((p) => {
                    const c = compFor(r, p.key);
                    return [
                      <td key={`v-${p.key}`} style={{
                        ...cellPad, textAlign: 'right', fontFamily: MONO, color: MUTED,
                        borderTop: topBorder,
                      }}>
                        {stringifyCell(c ? c.prior_display : null) || '—'}
                      </td>,
                      <td key={`c-${p.key}`} style={{ ...cellPad, textAlign: 'right', borderTop: topBorder }}>
                        <ChangeCell value={c ? c.change_pct : null} dir={c ? c.change_direction : null} />
                      </td>,
                    ];
                  })
                : [
                    showPrior ? (
                      <td key="prior" style={{
                        ...cellPad, textAlign: 'right', fontFamily: MONO, color: MUTED, borderTop: topBorder,
                      }}>
                        {stringifyCell(cell(r, 'prior_display', 'prior')) || '—'}
                      </td>
                    ) : null,
                    showChange ? (
                      <td key="change" style={{ ...cellPad, textAlign: 'right', borderTop: topBorder }}>
                        <ChangeCell value={cell(r, 'change_pct', 'change')} dir={cell(r, 'change_direction', 'direction')} />
                      </td>
                    ) : null,
                  ]}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ponytail: a matrix of short values (attendance: Present / Absent / —) with more
// columns than rows runs off the side of the page. Flipping it puts the long axis
// down the page, where there is room. Short cells only: a profile table has prose
// and photos, and turning its people into columns would be nonsense. The rule is
// stable under a payload that already comes the other way round — a tall matrix
// is left alone — so screen and export can't fight over the orientation.
function flipMatrix(rows: LooseRow[], cols: string[]): { rows: LooseRow[]; cols: string[] } | null {
  if (cols.length <= 4 || cols.length <= rows.length) return null;
  const [label, ...rest] = cols;
  const heads = rows.map((r) => stringifyCell(r[label]));
  // The row labels become column keys, so they have to be usable as such.
  if (heads.some((h) => !h || h === label) || new Set(heads).size !== heads.length) return null;
  if (rest.some((c) => rows.some((r) => stringifyCell(r[c]).length > 12))) return null;
  return {
    // Blank corner: the first column now holds what the header row used to.
    cols: ['', ...heads],
    rows: rest.map((c) =>
      Object.fromEntries([['', c] as [string, unknown], ...rows.map((r, i): [string, unknown] => [heads[i], r[c]])]),
    ),
  };
}

function GenericTable({ rows: given, columns }: { rows: LooseRow[]; columns?: string[] }) {
  // ponytail: the derived fallback is Object.keys order, which puts integer-like
  // keys ("2024", "2025") first regardless of where they sit in the row. Send an
  // explicit `columns` when order matters; fixing the derivation itself is a
  // bigger diff than the bug and no current payload without `columns` hits it.
  const givenCols =
    columns ??
    Array.from(
      given.reduce((set, r) => {
        Object.keys(r).forEach((k) => set.add(k));
        return set;
      }, new Set<string>()),
    );
  const flip = flipMatrix(given, givenCols);
  const rows = flip?.rows ?? given;
  const cols = flip?.cols ?? givenCols;
  // What a cell actually prints — the uncut text where the row carries one.
  const cellText = (r: LooseRow, c: string) => stringifyCell(r[fullKey(c)]) || stringifyCell(r[c]);
  // ponytail: longest cell decides. A column of dates or titles is kept on one
  // line; a column of prose gets room and wraps. 24 chars is the eyeballed line
  // between the two — swap it for a per-column hint if a payload ever needs one.
  const tight = new Set(cols.filter((c) => rows.every((r) => cellText(r, c).length <= 24)));

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: `2px solid ${BRAND}` }}>
          {cols.map((c) => (
            <th key={c} style={{ ...TH, textAlign: 'left' }}>{c.replace(/_/g, ' ')}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #F1F2F6' }}>
            {cols.map((c) => (
              // A cell can hold one line per job (BR32's Job title / Company /
              // Period / Experience read across), so keep the newlines and pin
              // the rows to the top — centred cells break the reading-across.
              <td
                key={c}
                style={{
                  padding: '9px 10px',
                  color: DARK,
                  verticalAlign: 'top',
                  // `pre` keeps a short column on one line, `pre-line` lets prose
                  // wrap — both keep the newlines that separate a director's jobs.
                  whiteSpace: tight.has(c) ? 'pre' : 'pre-line',
                }}
              >
                {isDataImage(r[c]) ? (
                  // A director headshot arrives inline as a data URI — printed
                  // as text it dumps a page of base64 into the table.
                  <img
                    src={r[c] as string}
                    alt=""
                    style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                  />
                ) : (
                  // The uncut text when the row carries one — the cell is cut
                  // for the PDF's page width, which the screen doesn't have.
                  stringifyCell(r[fullKey(c)]) || stringifyCell(r[c])
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The row key holding a cell's uncut text, e.g. "Experience" → experience_full.
// It is never in `columns`: the cut version exists for the exported PDF, which
// has a page width — on screen there is nothing to save by hiding it.
export const fullKey = (col: string) => `${col.toLowerCase().replace(/ /g, '_')}_full`;

function ChangeCell({ value, dir }: { value: unknown; dir: unknown }) {
  const pct = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : null;
  if (pct == null || Number.isNaN(pct)) return <span style={{ color: MUTED }}>—</span>;
  const color = dir === 'up' ? GREEN : dir === 'down' ? RED : MUTED;
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
  return (
    <span style={{ color, fontFamily: MONO, fontWeight: 600 }}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function isRecord(v: unknown): v is LooseRow {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
// A structured section's `analysis`/`content` field is sometimes an array of
// discrete points (rendered as bullets — see Bullets) rather than one prose
// string (rendered as justified paragraphs — see Prose).
function asProseItems(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const items = v.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
  return items.length ? items : undefined;
}
function cell(r: LooseRow, ...keys: string[]): unknown {
  for (const k of keys) if (r[k] != null) return r[k];
  return null;
}
function stringifyCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
