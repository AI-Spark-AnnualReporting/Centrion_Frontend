// Table sections whose shape varies per section (governance grids: director
// profiles, remuneration, meeting attendance) send an explicit `columns` list.
// It fixes both the set of columns and their order — without it the renderer
// derives columns from `Object.keys` of the rows, which puts integer-like keys
// ("2024", "2025") first and drops any column absent from every row.
//
// The quarterly and earnings payloads send no `columns` at all, so the last test
// here is the regression guard: their financial tables must render exactly as
// they did before.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionContent } from '@/components/quarterly/SectionContent';
import type { ProducedSection } from '@/types/quarterly';

const section = (content: unknown): ProducedSection => ({
  section_code: 'BR35',
  title: 'Test section',
  display_order: 1,
  source_type: 'test',
  mode: 'table',
  status: 'done',
  content: typeof content === 'string' ? content : JSON.stringify(content),
  feeder_status: 'ready',
});

const headers = () => screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());

describe('SectionContent — explicit columns', () => {
  it('renders the columns in the order given, not Object.keys order', () => {
    render(
      <SectionContent
        section={section({
          columns: ['Metric', '2025', '2024'],
          rows: [{ Metric: 'Revenue', '2025': '3,240', '2024': '2,910' }],
        })}
      />,
    );
    // Without the explicit list this is ["2024", "2025", "Metric"] — integer-like
    // keys sort ahead of string keys whatever the insertion order.
    expect(headers()).toEqual(['Metric', '2025', '2024']);
  });

  it('keeps a column that no row happens to fill', () => {
    render(
      <SectionContent
        section={section({
          columns: ['Director', '18 Feb', '22 Apr'],
          // Nobody attended 22 Apr — the column must still be there, empty.
          rows: [{ Director: 'Nora Al-Qahtani', '18 Feb': '✓' }],
        })}
      />,
    );
    expect(headers()).toEqual(['Director', '18 Feb', '22 Apr']);
    expect(screen.getByText('Nora Al-Qahtani')).toBeInTheDocument();
  });

  it('does not mistake a grid with a "value" column for a financial statement', () => {
    render(
      <SectionContent
        section={section({
          columns: ['Related party', 'Nature', 'value'],
          rows: [{ 'Related party': 'Al-Shifa Medical', Nature: 'Consumables', value: 'SAR 42m' }],
        })}
      />,
    );
    // FinancialTable would render a fixed Metric/Current pair and throw the rest
    // away; the grid keeps all three columns.
    expect(headers()).toEqual(['Related party', 'Nature', 'value']);
    expect(screen.getByText('Al-Shifa Medical')).toBeInTheDocument();
    expect(screen.getByText('SAR 42m')).toBeInTheDocument();
  });

  it('honours columns inside a multi-table payload', () => {
    render(
      <SectionContent
        section={section({
          tables: [
            { title: 'Committees', columns: ['Committee', 'Members'], rows: [{ Committee: 'Audit', Members: 'F. Al-Dosari' }] },
          ],
        })}
      />,
    );
    expect(headers()).toEqual(['Committee', 'Members']);
  });

  it('leaves the row keys that are not columns out of the table', () => {
    render(
      <SectionContent
        section={section({
          columns: ['Name', 'Role'],
          // Carried for linking (profile, CV, minutes file) — never cells.
          rows: [{ Name: 'Nora Al-Qahtani', Role: 'Chair', user_id: 'u-1', cv_path: '/cv.pdf' }],
        })}
      />,
    );
    expect(headers()).toEqual(['Name', 'Role']);
    expect(screen.queryByText('/cv.pdf')).not.toBeInTheDocument();
  });

  it('renders a data:image cell as an image, not as base64 text', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const { container } = render(
      <SectionContent
        section={section({
          columns: ['Photo', 'Name'],
          rows: [{ Photo: png, Name: 'Nora Al-Qahtani' }],
        })}
      />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe(png);
    expect(screen.queryByText(png)).not.toBeInTheDocument();
  });

  it('renders both grids of a BR35 attendance + register payload', () => {
    render(
      <SectionContent
        section={section({
          title: 'Board & committee meeting attendance',
          tables: [
            { title: 'Attendance', columns: ['Director', '18 Feb'], rows: [{ Director: 'Nora Al-Qahtani', '18 Feb': '—' }] },
            { title: 'Meeting register', columns: ['Date', 'Minutes'], rows: [{ Date: '18 Feb', Minutes: 'Minutes_Q1.docx', meeting_id: 'm-1' }] },
          ],
        })}
      />,
    );
    expect(headers()).toEqual(['Director', '18 Feb', 'Date', 'Minutes']);
    // An em dash means no minutes were filed — not "absent", and not blank.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('m-1')).not.toBeInTheDocument();
  });

  // ── regression guard: everything quarterly/earnings send today ──────────────

  it('still renders a financial table when no columns are given', () => {
    render(
      <SectionContent
        section={section({
          rows: [
            { label: 'Property, plant & equipment', current_display: '3,180' },
            { label: 'Total assets', current_display: '5,180', role: 'total' },
          ],
        })}
      />,
    );
    // FinancialTable's own fixed header, not a derived grid of the row keys.
    expect(headers()).toEqual(['Metric', 'Current']);
    expect(screen.getByText('Total assets')).toBeInTheDocument();
  });

  it('still derives columns from the rows when no columns are given', () => {
    render(
      <SectionContent
        section={section({ rows: [{ Committee: 'Audit', Members: 'F. Al-Dosari' }] })}
      />,
    );
    expect(headers()).toEqual(['Committee', 'Members']);
  });

  it('ignores a malformed columns value and falls back to deriving', () => {
    render(
      <SectionContent
        section={section({ columns: [], rows: [{ Committee: 'Audit', Members: 'F. Al-Dosari' }] })}
      />,
    );
    expect(headers()).toEqual(['Committee', 'Members']);
  });

  // BR32 sends the responsibility text twice: `Experience` cut at 300 per job for
  // the exported PDF, and `experience_full` uncut. On screen there is no page
  // width, so the uncut one wins — and it must never become a column of its own.
  it('prints the uncut text in the cut column, and never as a column', () => {
    render(
      <SectionContent
        section={section({
          columns: ['Name', 'Experience'],
          rows: [
            { Name: 'F. Al-Dosari', Experience: 'Chaired the…', experience_full: 'Chaired the audit committee.' },
            { Name: 'A. Nasser', Experience: 'Board member.', experience_full: '' },
          ],
        })}
      />,
    );
    expect(headers()).toEqual(['Name', 'Experience']);
    expect(screen.getByText('Chaired the audit committee.')).toBeInTheDocument();
    expect(screen.queryByText('Chaired the…')).not.toBeInTheDocument();
    // Empty string, not null, for a director with no work history — the cut
    // cell still prints rather than blanking.
    expect(screen.getByText('Board member.')).toBeInTheDocument();
  });

  // Attendance grids arrive as one row per member and one column per meeting, so
  // a quarter's worth of meetings runs off the side of the page. Wider than tall
  // and every cell short → flip it, members across the top.
  it('flips a short-celled matrix that is wider than it is tall', () => {
    render(
      <SectionContent
        section={section({
          columns: ['Member', 'Testing (30 Jul 2026)', 'Board meeting (30 Jul 2026)', 'Investor meeting (31 Jul 2026)', 'Annual board meeting (1 Aug 2026)'],
          rows: [
            { Member: 'Aizaz', 'Testing (30 Jul 2026)': 'Absent', 'Board meeting (30 Jul 2026)': '—', 'Investor meeting (31 Jul 2026)': 'Present', 'Annual board meeting (1 Aug 2026)': 'Present' },
            { Member: 'Usama', 'Testing (30 Jul 2026)': 'Present', 'Board meeting (30 Jul 2026)': 'Absent', 'Investor meeting (31 Jul 2026)': '—', 'Annual board meeting (1 Aug 2026)': '—' },
          ],
        })}
      />,
    );
    expect(headers()).toEqual(['', 'Aizaz', 'Usama']);
    expect(screen.getByText('Testing (30 Jul 2026)')).toBeInTheDocument();
  });

  // The director profiles table is just as wide, but its cells are prose and a
  // photo — flipping it would turn people into columns.
  it('leaves a wide table of prose alone', () => {
    render(
      <SectionContent
        section={section({
          columns: ['Photo', 'Name', 'Job title', 'Company', 'Period', 'Experience'],
          rows: [
            { Photo: '', Name: 'F. Al-Dosari', 'Job title': 'Board Member', Company: 'Attock', Period: 'Jan 2025 – Mar 2026', Experience: 'Evaluate technology recommendations where appropriate.' },
          ],
        })}
      />,
    );
    expect(headers()).toEqual(['Photo', 'Name', 'Job title', 'Company', 'Period', 'Experience']);
  });
});
