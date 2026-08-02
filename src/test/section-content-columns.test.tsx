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
});
