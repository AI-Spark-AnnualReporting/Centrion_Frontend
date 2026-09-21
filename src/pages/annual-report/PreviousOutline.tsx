// The company's OWN report structure, read from the contents page of the annual
// report they uploaded at onboarding (companies.report_outline_detail).
//
// Two things are in that tree and they are not the same kind of thing. The top level
// is a CATEGORY — the report's big divisions, which contents pages usually print as
// "Section 1: …", "Section 2: …". What sits under them is the actual section list.
// Only the sections are numbered, and they run 1..n straight through the whole
// document, ignoring the category breaks — so the last number is the report's real
// section count. Categories carry no number: they are headings over the list, not
// entries in it, and a second series in the same column just competes with it.
//
// The printed "Section N:" prefix is stripped from category titles: the number has
// its own column now, and leaving it would read "1  Section 1: About the Fund".
import type { CSSProperties } from 'react';
import type { ReportOutlineDetail, ReportOutlineEntry } from '@/types/company';
import { Spinner } from '@/components/shared/Spinner';

const INK = '#1A1D2E';
const MUTED = '#5A6080';
const FAINT = '#9BA3C4';
const ACCENT = '#4040C8';
const MONO = "'DM Mono', monospace";

// Matches the table on the System tab so the two read as the same kind of list.
const td: CSSProperties = { fontSize: 12, color: INK, padding: '12px 16px' };
const INDENT_STEP = 20;

// "Section 1: About the Fund" / "Part 2 — Governance" / "3. Financial Statements".
const CATEGORY_PREFIX = /^\s*(section|part|chapter)?\s*\d+\s*[:.–—-]\s*/i;

function stripPrefix(title: string): string {
  const stripped = title.replace(CATEGORY_PREFIX, '').trim();
  // Never strip a title down to nothing — a category genuinely called "4" keeps it.
  return stripped || title;
}

/** The level, clamped to what we can render. Survives a missing or junk value. */
function levelOf(entry: ReportOutlineEntry): 1 | 2 | 3 {
  const raw = Number(entry.level ?? 1);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(3, Math.max(1, Math.round(raw))) as 1 | 2 | 3;
}

/**
 * What to print. `title` is the English one and is what we want; `title_verbatim` is
 * the fallback, because on an Arabic report the English title can come back empty and
 * a row in the source language beats no row at all.
 */
function labelOf(entry: ReportOutlineEntry): { text: string; verbatim: boolean } {
  const title = (entry.title ?? '').trim();
  if (title) return { text: title, verbatim: false };
  return { text: (entry.title_verbatim ?? '').trim(), verbatim: true };
}

function EmptyState({ headline, explainer, onShowSystem }: {
  headline: string;
  explainer: string;
  onShowSystem: () => void;
}) {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{headline}</div>
      <div style={{ fontSize: 12, color: FAINT, marginTop: 4, lineHeight: 1.5 }}>{explainer}</div>
      <button
        type="button"
        onClick={onShowSystem}
        style={{
          marginTop: 12,
          background: 'transparent',
          border: 'none',
          padding: 0,
          fontSize: 12,
          fontWeight: 700,
          color: ACCENT,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Show the system outline
      </button>
    </div>
  );
}

export interface PreviousOutlineProps {
  detail: ReportOutlineDetail | null | undefined;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onShowSystem: () => void;
}

export function PreviousOutline({
  detail,
  loading,
  error,
  onRetry,
  onShowSystem,
}: PreviousOutlineProps) {
  if (loading) return <Spinner pad={40} />;

  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: '20px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, color: '#DC2626' }}>{error}</span>
        <button className="btn bs bsm" type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  const entries: ReportOutlineEntry[] = Array.isArray(detail?.entries) ? detail.entries : [];

  // One counter, for sections only — it runs straight through the categories.
  let sectionNo = 0;
  const rows = entries
    .map((entry) => ({ entry, level: levelOf(entry), ...labelOf(entry) }))
    .filter((r) => r.text)
    .map((r) => {
      const isCategory = r.level === 1;
      if (!isCategory) sectionNo += 1;
      return {
        ...r,
        isCategory,
        number: isCategory ? null : sectionNo,
        text: isCategory ? stripPrefix(r.text) : r.text,
      };
    });

  if (rows.length === 0) {
    // `detail == null` means extraction never ran for this company; `found === false`
    // means it ran and there was no contents page to read. Same empty card, different
    // sentence — one is a gap in our processing, the other a fact about their report.
    const ranAndFoundNothing = detail != null && detail.found === false;
    return (
      <EmptyState
        headline={ranAndFoundNothing ? 'No contents page found' : 'No previous outline yet'}
        explainer={
          ranAndFoundNothing
            ? "We read this company's last annual report but couldn't find a contents page in it."
            : "We haven't read a contents page from this company's last annual report."
        }
        onShowSystem={onShowSystem}
      />
    );
  }

  // A company's stored sections are all one level with no chapters above them. Indenting
  // and muting them then leaves a ladder shoved 20px right under nothing, reading weaker
  // than the System tab beside it — so when no level-1 row is present, drop the indent
  // and render at full strength.
  const flat = !rows.some((r) => r.isCategory);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((r, i) => {
          const sourceTitle = r.entry.title_verbatim?.trim();
          return (
            <tr
              key={`${r.text}-${i}`}
              style={{
                borderTop: '1px solid #F4F5FB',
                // A category is a divider with a name — the tint sets it apart without
                // introducing a second border weight.
                background: r.isCategory ? '#FAFBFE' : undefined,
              }}
            >
              {/* A category has no number, so it spans the number column too and
                  starts flush at the card's left edge — leaving an empty cell would
                  indent every heading by the width of a column it does not use. */}
              {!r.isCategory && (
                <td style={{ ...td, width: 44, fontFamily: MONO, color: FAINT }}>
                  {r.number}
                </td>
              )}
              <td
                colSpan={r.isCategory ? 2 : undefined}
                // dir="auto" only where the text is the source-language fallback — the
                // one case that can be RTL in this LTR page. Indentation is a LOGICAL
                // property to match, or an Arabic outline would step the wrong way.
                dir={r.verbatim ? 'auto' : undefined}
                // The source-language title on hover, when we show the English one and
                // the two differ. Provenance without a second line on every row.
                title={!r.verbatim && sourceTitle && sourceTitle !== r.text ? sourceTitle : undefined}
                style={{
                  ...td,
                  paddingInlineStart:
                    r.isCategory || flat ? 16 : 16 + (r.level - 1) * INDENT_STEP,
                  fontWeight: r.isCategory ? 700 : flat ? 600 : 500,
                  color: r.isCategory || flat ? INK : MUTED,
                }}
              >
                {r.text}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
