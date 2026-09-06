// BR32 as profile cards, in one of three arrangements.
//
// The table prints a director's jobs as four stacked cells; a card needs them
// back as jobs, and they can't be recovered by splitting those cells — a
// director's own line breaks inside Experience mean job 2 is not line 2. So the
// row carries `jobs: [{job_title, company, period, experience}]` alongside, and
// the cards read that. A section produced before the backend sent `jobs` has
// none, and prints as the table whatever layout is saved.
//
// The three variants differ only in how the cards are arranged on the page, so
// the card's own content is written once. Modelled on CoverRenderer, which
// likewise renders one payload three ways.
//
// Every visual value lives in board-profile-cards.css, not here: the exporter
// renders the PDF and DOCX from that same file, and a style written inline would
// be a style the download doesn't have.

import { SectionContent } from '@/components/quarterly/SectionContent';
import { fullKey, isDataImage } from '@/components/quarterly/sectionState';
import type { ProducedSection } from '@/types/quarterly';
import type { BoardCardVariant } from './board-helpers';
import './board-profile-cards.css';

// The columns `jobs` replaces. Everything else the payload lists becomes a
// labelled block of its own — dormant today, but a Qualifications or Memberships
// column would print without a change here.
const JOB_COLS = ['Job title', 'Company', 'Period', 'Experience'];

type Row = Record<string, unknown>;
interface Job {
  job_title?: string | null;
  company?: string | null;
  period?: string | null;
  experience?: string | null;
}

const str = (v: unknown) => (v == null ? '' : String(v)).trim();
const lines = (v: unknown) =>
  str(v)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
// The uncut text where the row carries one: `Experience` is cut at 300 characters
// per job for the PDF's page width, and the screen has no page width.
const cell = (r: Row, c: string) => r[fullKey(c)] ?? r[c];

function parseRows(content: string | null): { rows: Row[]; columns: string[] } | null {
  if (!content) return null;
  try {
    const p = JSON.parse(content) as Record<string, unknown>;
    const t = Array.isArray(p.tables) ? (p.tables[0] as Record<string, unknown> | undefined) : undefined;
    const rows = (Array.isArray(p.rows) ? p.rows : Array.isArray(t?.rows) ? t.rows : []) as Row[];
    const columns = (Array.isArray(p.columns) ? p.columns : Array.isArray(t?.columns) ? t.columns : []).filter(
      (c): c is string => typeof c === 'string',
    );
    return rows.length ? { rows, columns } : null;
  } catch {
    return null;
  }
}

export default function BoardProfileCards({
  section,
  variant,
}: {
  section: ProducedSection;
  variant: BoardCardVariant;
}) {
  const parsed = parseRows(section.content);
  // Not the shape cards are built from — print the table rather than nothing. A
  // section produced before `jobs` existed lands here too: its rows can't be
  // split into jobs, and a re-produce is what fixes it.
  if (!parsed || !parsed.rows.some((r) => Array.isArray(r.jobs))) {
    return <SectionContent section={section} />;
  }

  const blockCols = parsed.columns.filter(
    (c) => c !== 'Photo' && c !== 'Name' && !JOB_COLS.includes(c),
  );

  if (variant === 'grid') {
    return (
      <div className="bpc-grid">
        {parsed.rows.map((r, i) => (
          <GridCard key={i} row={r} blockCols={blockCols} />
        ))}
      </div>
    );
  }
  if (variant === 'band') {
    return (
      <div className="bpc-stack">
        {parsed.rows.map((r, i) => (
          <BandCard key={i} row={r} blockCols={blockCols} />
        ))}
      </div>
    );
  }
  return (
    <div className="bpc-stack bpc-stack--rows">
      {parsed.rows.map((r, i) => (
        <RowCard key={i} row={r} blockCols={blockCols} />
      ))}
    </div>
  );
}

// ─── the parts every variant shares ───────────────────────────────────────────

/** The director's jobs, in the order the section stacked them. */
const jobsOf = (row: Row): Job[] => (Array.isArray(row.jobs) ? (row.jobs as Job[]) : []);

/** One job as a line: "Board Member — Attock (Jan 2025 – present)". */
const jobLine = (j: Job) =>
  [[str(j.job_title), str(j.company)].filter(Boolean).join(' — '), str(j.period) && `(${str(j.period)})`]
    .filter(Boolean)
    .join(' ');

/**
 * One labelled block, or nothing at all when there is nothing to say — a
 * director with a photo and no positions gets their name and no empty headings.
 */
function Block({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="bpc-block">
      <div className="bpc-label">{label}:</div>
      {values.length === 1 ? (
        <div className="bpc-value">{values[0]}</div>
      ) : (
        <ol className="bpc-list">
          {values.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The blocks under a name: the current job, the earlier ones, then the rest. */
function Blocks({ row, blockCols }: { row: Row; blockCols: string[] }) {
  const jobs = jobsOf(row);
  const [current, ...previous] = jobs.map(jobLine).filter(Boolean);
  // The responsibilities the director wrote, in job order and keeping their own
  // line breaks — which is exactly why the cards read `jobs` and not the cells.
  const experience = jobs.flatMap((j) => lines(j.experience));
  return (
    <>
      <Block label="Current position" values={current ? [current] : []} />
      <Block label="Previous position" values={previous} />
      <Block label="Experience" values={experience} />
      {blockCols.map((c) => (
        <Block key={c} label={c} values={lines(cell(row, c))} />
      ))}
    </>
  );
}

/** Nothing to print for this person under any heading. */
const isEmpty = (row: Row, blockCols: string[]) =>
  !jobsOf(row).some((j) => jobLine(j) || str(j.experience)) &&
  !blockCols.some((c) => lines(cell(row, c)).length);

/**
 * The headshot, or the director's initials when the row has none — a person
 * with no photo still gets a card the same size as everyone else's.
 */
function Photo({ row, className }: { row: Row; className: string }) {
  const photo = row.Photo;
  if (isDataImage(photo)) {
    return <img className={`bpc-photo ${className}`} src={photo as string} alt="" />;
  }
  const initials = str(row.Name)
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
  return <div className={`bpc-initials ${className}`}>{initials || '—'}</div>;
}

const name = (row: Row) => str(row.Name) || '—';

/** Nothing recorded for this person yet — say so rather than leave a blank card. */
const Nothing = () => <div className="bpc-empty">No positions recorded for this board member.</div>;

// ─── grid: photo on top, name in a brand strip ────────────────────────────────

function GridCard({ row, blockCols }: { row: Row; blockCols: string[] }) {
  return (
    <article className="bpc-card">
      <Photo row={row} className="bpc-grid-photo" />
      <div className="bpc-name-strip">{name(row)}</div>
      <div className="bpc-card-body">
        {isEmpty(row, blockCols) ? <Nothing /> : <Blocks row={row} blockCols={blockCols} />}
      </div>
    </article>
  );
}

// ─── band: the photo stands over a brand banner, blocks in two columns ───────

function BandCard({ row, blockCols }: { row: Row; blockCols: string[] }) {
  return (
    <article className="bpc-band">
      <div className="bpc-band-head">
        <div className="bpc-banner">{name(row)}</div>
        <Photo row={row} className="bpc-band-photo" />
      </div>
      <div className="bpc-cols">
        {isEmpty(row, blockCols) ? <Nothing /> : <Blocks row={row} blockCols={blockCols} />}
      </div>
    </article>
  );
}

// ─── row: photo left, everything else right ──────────────────────────────────

function RowCard({ row, blockCols }: { row: Row; blockCols: string[] }) {
  return (
    <article className="bpc-card">
      <div className="bpc-row">
        <Photo row={row} className="bpc-row-photo" />
        <div className="bpc-row-main">
          <div className="bpc-row-name">{name(row)}</div>
          {isEmpty(row, blockCols) ? (
            <Nothing />
          ) : (
            <div className="bpc-row-cols">
              <Blocks row={row} blockCols={blockCols} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
