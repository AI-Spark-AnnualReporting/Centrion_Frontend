// A BR32 row prints its jobs as four stacked cells for the table and carries
// them structurally as `jobs` for the cards — the cells can't be split back
// apart, because a director's own line breaks inside Experience mean job 2 is
// not line 2 of the Company cell. These check the cards read `jobs`, and that a
// row without one (produced before the backend sent it) prints as the table.

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BoardProfileCards from '@/pages/annual-report/BoardProfileCards';
import { boardCardVariant } from '@/pages/annual-report/board-helpers';
import type { ProducedSection } from '@/types/quarterly';

const section = (content: unknown): ProducedSection => ({
  section_code: 'BR32',
  title: 'Board of Directors & profiles (CVs)',
  display_order: 1,
  source_type: 'test',
  mode: 'table',
  status: 'produced',
  content: JSON.stringify(content),
  feeder_status: 'ready',
});

const COLUMNS = ['Photo', 'Name', 'Job title', 'Company', 'Period', 'Experience'];

// The stacked cells the table prints. Three jobs, but five Experience lines —
// splitting the cells would pair job 2 with the wrong company and period.
const CELLS = {
  Photo: '',
  Name: 'F. Al-Dosari',
  'Job title': 'Board Member\nCFO\nAnalyst',
  Company: 'Attock\nRaidah\nPublic Pension Agency',
  Period: 'Jan 2025 – present\nJan 2020 – Dec 2024\nJan 2016 – Dec 2019',
  Experience: 'Chaired the audit committee.\nReviewed the annual budget.\nRan the desk.',
  user_id: 'u-1',
};

const threeJobs = {
  ...CELLS,
  jobs: [
    {
      job_title: 'Board Member',
      company: 'Attock',
      period: 'Jan 2025 – present',
      experience: 'Chaired the audit committee.\nReviewed the annual budget.',
    },
    { job_title: 'CFO', company: 'Raidah', period: 'Jan 2020 – Dec 2024', experience: 'Ran the desk.' },
    { job_title: 'Analyst', company: 'Public Pension Agency', period: 'Jan 2016 – Dec 2019', experience: '' },
  ],
};

const photoOnly = {
  // A 1×1 gif — the shape a real headshot arrives in.
  Photo: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
  Name: 'Board1 Memeber1',
  'Job title': '',
  Company: '',
  Period: '',
  Experience: '',
  jobs: [],
};

describe('BoardProfileCards', () => {
  it('builds one block per job from `jobs`, not from the stacked cells', () => {
    render(
      <BoardProfileCards section={section({ columns: COLUMNS, rows: [threeJobs] })} variant="band" />,
    );
    // Job 1 is the current position; the other two keep their own company and
    // period rather than borrowing another job's.
    expect(screen.getByText('Board Member — Attock (Jan 2025 – present)')).toBeInTheDocument();
    const previous = screen.getByText('Previous position:').parentElement!;
    expect(within(previous).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'CFO — Raidah (Jan 2020 – Dec 2024)',
      'Analyst — Public Pension Agency (Jan 2016 – Dec 2019)',
    ]);
  });

  it('prints each job’s experience in job order, and no non-column keys', () => {
    render(
      <BoardProfileCards section={section({ columns: COLUMNS, rows: [threeJobs] })} variant="grid" />,
    );
    const experience = screen.getByText('Experience:').parentElement!;
    expect(within(experience).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Chaired the audit committee.',
      'Reviewed the annual budget.',
      'Ran the desk.',
    ]);
    expect(screen.queryByText('u-1')).not.toBeInTheDocument();
  });

  // A section produced before the backend sent `jobs` can't be rebuilt into
  // cards; it prints as the table until it is re-produced.
  it('falls back to the table when the rows carry no jobs', () => {
    render(<BoardProfileCards section={section({ columns: COLUMNS, rows: [CELLS] })} variant="band" />);
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent?.trim())).toEqual(COLUMNS);
    expect(screen.queryByText('Current position:')).not.toBeInTheDocument();
  });

  it('keeps a director who has nothing recorded, with no orphan headings', () => {
    const { container } = render(
      <BoardProfileCards section={section({ columns: COLUMNS, rows: [photoOnly] })} variant="row" />,
    );
    expect(screen.getByText('Board1 Memeber1')).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeNull();
    expect(screen.queryByText('Current position:')).not.toBeInTheDocument();
    expect(screen.getByText(/No positions recorded/)).toBeInTheDocument();
  });

  it('falls back to the table renderer when the content is not card-shaped', () => {
    render(<BoardProfileCards section={section({ rows: [] })} variant="grid" />);
    // SectionContent's empty branch, not a blank section.
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});

describe('boardCardVariant', () => {
  it('reads the saved layout, and only for the profile section', () => {
    expect(boardCardVariant({ section_code: 'BR32', layout: 'cards_band' })).toBe('band');
    expect(boardCardVariant({ section_code: 'BR32', layout: 'table' })).toBeNull();
    // A server without the field keeps printing the table.
    expect(boardCardVariant({ section_code: 'BR32' })).toBeNull();
    // Cards are built from director rows — no other section has them.
    expect(boardCardVariant({ section_code: 'BR35', layout: 'cards_grid' })).toBeNull();
  });
});
