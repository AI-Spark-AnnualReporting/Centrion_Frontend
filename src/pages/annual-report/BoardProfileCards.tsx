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

import type { ReactNode } from 'react';
import { SectionContent, fullKey } from '@/components/quarterly/SectionContent';
import { isDataImage } from '@/components/quarterly/sectionState';
import type { ProducedSection } from '@/types/quarterly';
import type { BoardCardVariant } from './board-helpers';
import { BORDER_SOFT, FAINT, INK, MUTED } from './board-ui';

// Report content follows the report's chosen brand colour, exactly as the table
// headers do (see SectionContent).
const BRAND = 'var(--brand-primary, #4040C8)';

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))', gap: 18 }}>
        {parsed.rows.map((r, i) => (
          <GridCard key={i} row={r} blockCols={blockCols} />
        ))}
      </div>
    );
  }
  if (variant === 'band') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {parsed.rows.map((r, i) => (
          <BandCard key={i} row={r} blockCols={blockCols} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
    <div style={{ breakInside: 'avoid', marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: BRAND, marginBottom: 3 }}>{label}:</div>
      {values.length === 1 ? (
        <div style={{ fontSize: 12.5, color: INK, lineHeight: 1.5 }}>{values[0]}</div>
      ) : (
        <ol style={{ margin: '2px 0 0', paddingLeft: 24, fontSize: 12.5, color: INK, lineHeight: 1.45 }}>
          {values.map((v, i) => (
            <li key={i} style={{ marginBottom: 3 }}>
              {v}
            </li>
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
function Photo({ row, style }: { row: Row; style: React.CSSProperties }) {
  const photo = row.Photo;
  if (isDataImage(photo)) {
    return <img src={photo as string} alt="" style={{ ...style, objectFit: 'cover', display: 'block' }} />;
  }
  const initials = str(row.Name)
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F2F3FA',
        color: FAINT,
        fontSize: 28,
        fontWeight: 800,
      }}
    >
      {initials || '—'}
    </div>
  );
}

const name = (row: Row) => str(row.Name) || '—';

/** Nothing recorded for this person yet — say so rather than leave a blank card. */
function Nothing() {
  return (
    <div style={{ fontSize: 12, color: FAINT, fontStyle: 'italic' }}>
      No positions recorded for this board member.
    </div>
  );
}

function shell(children: ReactNode, extra?: React.CSSProperties) {
  return (
    <article
      style={{
        border: `1px solid ${BORDER_SOFT}`,
        borderRadius: 12,
        background: '#fff',
        overflow: 'hidden',
        breakInside: 'avoid',
        ...extra,
      }}
    >
      {children}
    </article>
  );
}

// ─── grid: photo on top, name in a brand strip ────────────────────────────────

function GridCard({ row, blockCols }: { row: Row; blockCols: string[] }) {
  const empty = isEmpty(row, blockCols);
  return shell(
    <>
      <Photo row={row} style={{ width: '100%', height: 158 }} />
      <div
        style={{
          background: BRAND,
          color: '#fff',
          padding: '8px 12px',
          fontSize: 13.5,
          fontWeight: 700,
        }}
      >
        {name(row)}
      </div>
      <div style={{ padding: '12px 12px 2px' }}>
        {empty ? <Nothing /> : <Blocks row={row} blockCols={blockCols} />}
      </div>
    </>,
  );
}

// ─── band: photo top-left, name across a dark strip, blocks in two columns ────

function BandCard({ row, blockCols }: { row: Row; blockCols: string[] }) {
  const empty = isEmpty(row, blockCols);
  return (
    <article style={{ breakInside: 'avoid' }}>
      {/* The photo stands taller than the banner and overlaps it, which is what
          makes this read as the printed board section rather than a card. The
          padding above the banner is the overhang. */}
      <div style={{ position: 'relative', paddingTop: 46 }}>
        <div
          style={{
            height: 84,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 180,
            paddingRight: 16,
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.3,
            // The company's own colour, fading out to the right so the page shows
            // through — the reference's grey banner, in the report's brand. The
            // scrim over the left is what keeps the name legible on a pale brand,
            // which a hex we don't have here couldn't be tested for.
            background: `linear-gradient(90deg, rgba(0,0,0,.42) 0%, rgba(0,0,0,.12) 46%, transparent 100%),
                         linear-gradient(90deg, ${BRAND} 0%, ${BRAND} 52%, transparent 100%)`,
            borderBottom: `3px solid var(--brand-secondary, ${BRAND})`,
          }}
        >
          {name(row)}
        </div>
        <Photo row={row} style={{ position: 'absolute', left: 10, bottom: 3, width: 150, height: 127 }} />
      </div>

      {/* Two columns the content flows down, one block never split across them. */}
      <div style={{ padding: '16px 2px 0', columns: 2, columnGap: 40 }}>
        {empty ? <Nothing /> : <Blocks row={row} blockCols={blockCols} />}
      </div>
    </article>
  );
}

// ─── row: photo left, everything else right ──────────────────────────────────

function RowCard({ row, blockCols }: { row: Row; blockCols: string[] }) {
  const empty = isEmpty(row, blockCols);
  return shell(
    <div style={{ display: 'flex', gap: 18, padding: 16, alignItems: 'flex-start' }}>
      <Photo row={row} style={{ width: 132, height: 132, borderRadius: 8, flex: '0 0 auto' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: INK,
            borderBottom: `2px solid ${BRAND}`,
            paddingBottom: 7,
            marginBottom: 12,
          }}
        >
          {name(row)}
        </div>
        {empty ? (
          <Nothing />
        ) : (
          // Same two columns as the band, without the photo taking the first one.
          <div style={{ columns: 2, columnGap: 28, color: MUTED }}>
            <Blocks row={row} blockCols={blockCols} />
          </div>
        )}
      </div>
    </div>,
  );
}
