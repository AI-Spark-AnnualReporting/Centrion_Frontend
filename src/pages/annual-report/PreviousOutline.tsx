// The Previous outline: this cycle's sections, grouped under the chapter headings of
// the contents page they were read from (the annual report the company uploaded).
//
// The chapters come from GET /companies/{id}/latest-outline: level-1 entries are the
// chapters, and each level-2 entry carries the section_code it was stored as. That is
// how a cycle section finds its chapter. A section the contents page does not name
// (Theme Rationale, added to every report) goes in a last group, "Added for this
// report", so the chapters stay exactly as printed.
//
// Chapters carry no number: they are headings over the list, not entries in it. The
// sections are numbered straight through, ignoring the chapter breaks.
//
// The printed "Section N:" prefix is stripped from chapter titles: leaving it would
// read "Section 1: About the Fund" over a section numbered 1.
import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { ReportOutlineDetail } from '@/types/company';
import type { CycleSection } from '@/types/cycles';
import { Spinner } from '@/components/shared/Spinner';
import { SectionModeBadge, SectionStatusBadge } from './cycle-ui';

const INK = '#1A1D2E';
const FAINT = '#9BA3C4';
const MONO = "'DM Mono', monospace";

// Matches the table on the System outline so the two read as the same kind of list.
const th: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: FAINT,
  textTransform: 'uppercase',
  letterSpacing: '.5px',
  textAlign: 'left',
  padding: '12px 16px',
};
const td: CSSProperties = { fontSize: 12, color: INK, padding: '12px 16px' };
const SECTION_INDENT = 34;

export const ADDED_FOR_THIS_REPORT = 'Added for this report';

// "Section 1: About the Fund" / "Part 2 — Governance" / "3. Financial Statements".
const CHAPTER_PREFIX = /^\s*(section|part|chapter)?\s*\d+\s*[:.–—-]\s*/i;

/** A chapter title without its printed "Section N:" prefix. Never strips to nothing. */
export function stripPrefix(title: string): string {
  const stripped = title.replace(CHAPTER_PREFIX, '').trim();
  return stripped || title;
}

/** The English title, or the source-language one when the English came back empty. */
function entryTitle(entry: { title?: string; title_verbatim?: string }): string {
  const title = (entry.title ?? '').trim();
  if (title) return title;
  return (entry.title_verbatim ?? '').trim();
}

/**
 * Which chapter each section sits under, keyed by section_code.
 * Empty when the contents page had no chapters (or was never read).
 */
export function chapterBySectionCode(detail: ReportOutlineDetail | null | undefined): Map<string, string> {
  const result = new Map<string, string>();
  const entries = Array.isArray(detail?.entries) ? detail.entries : [];
  let chapter: string | null = null;
  for (const entry of entries) {
    if (entry.level === 1) {
      chapter = stripPrefix(entryTitle(entry));
      continue;
    }
    if (chapter && entry.section_code) {
      result.set(entry.section_code, chapter);
    }
  }
  return result;
}

export interface ChapterGroup<T> {
  /** null only when the outline has no chapters at all: one flat, untitled group. */
  title: string | null;
  items: T[];
}

/**
 * Split sections into chapter groups, keeping their order. A section whose chapter is
 * unknown goes in a last "Added for this report" group. With no chapters at all, the
 * result is one untitled group: the list shows flat, as it always did.
 */
export function groupByChapter<T extends { section_code: string }>(
  items: T[],
  detail: ReportOutlineDetail | null | undefined,
): ChapterGroup<T>[] {
  const chapters = chapterBySectionCode(detail);
  if (chapters.size === 0) {
    return items.length > 0 ? [{ title: null, items }] : [];
  }

  const groups: ChapterGroup<T>[] = [];
  const extras: T[] = [];
  for (const item of items) {
    const chapter = chapters.get(item.section_code);
    if (!chapter) {
      extras.push(item);
      continue;
    }
    const last = groups[groups.length - 1];
    if (last && last.title === chapter) {
      last.items.push(item);
    } else {
      groups.push({ title: chapter, items: [item] });
    }
  }
  if (extras.length > 0) {
    groups.push({ title: ADDED_FOR_THIS_REPORT, items: extras });
  }
  return groups;
}

/** The number of each group's first section, so numbering runs straight through. */
export function firstNumbers<T>(groups: ChapterGroup<T>[]): number[] {
  const result: number[] = [];
  let next = 1;
  for (const group of groups) {
    result.push(next);
    next += group.items.length;
  }
  return result;
}

/**
 * Which chapters are folded, by title. All start open. Only changes what is shown;
 * the report's sections are untouched.
 */
export function useFoldedChapters(): { isFolded: (title: string) => boolean; toggle: (title: string) => void } {
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const isFolded = (title: string) => folded.has(title);
  const toggle = (title: string) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };
  return { isFolded, toggle };
}

/** A chapter heading that folds its sections: arrow, title, section count. */
export function ChapterToggle({
  title,
  count,
  folded,
  onToggle,
  style,
}: {
  title: string;
  count: number;
  folded: boolean;
  onToggle: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!folded}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        color: INK,
        fontWeight: 800,
        letterSpacing: '.6px',
        textTransform: 'uppercase',
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ width: 10, color: FAINT, fontSize: 10 }}>
        {folded ? '▸' : '▾'}
      </span>
      {title}
      <span style={{ fontFamily: MONO, fontWeight: 500, color: FAINT, letterSpacing: 0 }}>{count}</span>
    </button>
  );
}

export interface PreviousOutlineProps {
  /** The cycle's sections, already filtered by mode. */
  sections: CycleSection[];
  /** The contents page the chapter headings come from. */
  detail: ReportOutlineDetail | null | undefined;
  loading: boolean;
  error: string;
  onRetry: () => void;
}

export function PreviousOutline({ sections, detail, loading, error, onRetry }: PreviousOutlineProps) {
  const { isFolded, toggle } = useFoldedChapters();

  if (loading) return <Spinner pad={40} />;

  const groups = groupByChapter(sections, detail);
  const starts = firstNumbers(groups);

  return (
    <div>
      {/* The chapters are a display aid. Failing to load them still shows every
          section, flat, with a way to try again. */}
      {error && (
        <div
          role="alert"
          style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid #F4F5FB' }}
        >
          <span style={{ fontSize: 12, color: '#DC2626' }}>{error}</span>
          <button className="btn bs bsm" type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {groups.length === 0 ? (
        <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: FAINT }}>No sections.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFBFE' }}>
              <th style={{ ...th, width: 44 }}>#</th>
              <th style={th}>Section</th>
              <th style={th}>Mode</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, gi) => (
              <ChapterRows
                key={`${group.title ?? 'flat'}-${gi}`}
                group={group}
                firstNumber={starts[gi]}
                folded={group.title !== null && isFolded(group.title)}
                onToggle={() => group.title !== null && toggle(group.title)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** One chapter: its heading row (when it has a title), then its numbered sections
 *  unless the chapter is folded. Numbers stay fixed whether or not others are folded. */
function ChapterRows({
  group,
  firstNumber,
  folded,
  onToggle,
}: {
  group: ChapterGroup<CycleSection>;
  firstNumber: number;
  folded: boolean;
  onToggle: () => void;
}) {
  const indented = group.title !== null;
  return (
    <>
      {group.title !== null && (
        <tr style={{ borderTop: '1px solid #ECEEF8', background: '#FAFBFE' }}>
          <td colSpan={4} style={{ ...td, fontSize: 11 }}>
            <ChapterToggle title={group.title} count={group.items.length} folded={folded} onToggle={onToggle} />
          </td>
        </tr>
      )}
      {!folded && group.items.map((s, i) => (
        <tr key={s.section_code} style={{ borderTop: '1px solid #F4F5FB' }}>
          <td style={{ ...td, color: FAINT, fontFamily: MONO }}>{firstNumber + i}</td>
          <td style={{ ...td, fontWeight: 600, paddingInlineStart: indented ? SECTION_INDENT : 16 }}>{s.title}</td>
          <td style={td}><SectionModeBadge mode={s.mode} /></td>
          <td style={td}><SectionStatusBadge status={s.status} /></td>
        </tr>
      ))}
    </>
  );
}
