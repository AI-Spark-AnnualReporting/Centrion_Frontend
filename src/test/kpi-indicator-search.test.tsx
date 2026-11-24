// The KPI Normalizer's GRI (128) and IFRS (109) cards had no search (QA audit
// KP-06). Each card now has its own search box over code, name, category and unit.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { filterIndicators } from '@/lib/indicatorSearch';
import type { FrameworkIndicator } from '@/lib/api';

const row = (framework: string, code: string, label: string, category = 'Environmental', unit: string | null = null) =>
  ({ framework, source_code: code, indicator_label: label, esg_category: category, expected_unit: unit }) as FrameworkIndicator;

const CATALOGUE = [
  row('GRI', '305-1', 'Direct (Scope 1) GHG emissions', 'Environmental', 'tCO2e'),
  row('GRI', '305-2', 'Energy indirect (Scope 2) GHG emissions', 'Environmental', 'tCO2e'),
  row('GRI', '2-1', 'Organizational details', 'Universal'),
  row('GRI', '405-1', 'Diversity of governance bodies and employees', 'Social', '%'),
  row('IFRS-S2', 'IFRS-S2-29a-i-1', 'Scope 1 greenhouse gas emissions', 'Environmental', 'tCO2e'),
  row('IFRS-S1', 'IFRS-S1-27a', 'Governance body responsible for oversight', 'Governance'),
];

describe('filterIndicators', () => {
  const gri = CATALOGUE.filter((r) => r.framework === 'GRI');

  it('returns everything for an empty or blank search', () => {
    expect(filterIndicators(gri, '')).toHaveLength(4);
    expect(filterIndicators(gri, '   ')).toHaveLength(4);
  });

  it('matches part of a code', () => {
    expect(filterIndicators(gri, '305').map((r) => r.source_code)).toEqual(['305-1', '305-2']);
    expect(filterIndicators(gri, '2-1').map((r) => r.source_code)).toEqual(['2-1']);
  });

  it('matches the name, ignoring case and extra spaces', () => {
    expect(filterIndicators(gri, '  GHG   emissions ').map((r) => r.source_code)).toEqual(['305-1', '305-2']);
  });

  it('matches the category and the unit', () => {
    expect(filterIndicators(gri, 'social').map((r) => r.source_code)).toEqual(['405-1']);
    expect(filterIndicators(gri, 'tco2e')).toHaveLength(2);
  });

  it('returns nothing for a search with no match, and never crashes on special characters', () => {
    expect(filterIndicators(gri, 'zzzz')).toEqual([]);
    expect(filterIndicators(gri, '(.*[')).toEqual([]);
  });
});

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    documents: { byReport: () => Promise.resolve({ reports: [] }) },
    esg: { getEvidence: () => Promise.resolve({ evidence: [] }) },
    quarterlyReports: { getFigures: () => Promise.resolve({ figures: [] }) },
    lookups: {
      frameworkIndicators: () => Promise.resolve(CATALOGUE),
      financialMetrics: () => Promise.resolve([]),
    },
  };
});
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', company_id: 'co-1', role: 'admin' } }),
}));

const { default: KPIPage } = await import('@/pages/KPIPage');

async function renderPage() {
  render(
    <MemoryRouter>
      <KPIPage />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByLabelText('Search GRI indicators')).toBeInTheDocument());
}

describe('KPI Normalizer indicator search', () => {
  it('filters the GRI card and says how many are shown', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Search GRI indicators'), { target: { value: '305' } });
    expect(screen.getByText('Direct (Scope 1) GHG emissions')).toBeInTheDocument();
    expect(screen.queryByText('Organizational details')).toBeNull();
    expect(screen.getByText('Showing 2 of 4')).toBeInTheDocument();
  });

  it('keeps each card separate: a GRI search does not hide IFRS rows', async () => {
    await renderPage();
    fireEvent.change(screen.getByLabelText('Search GRI indicators'), { target: { value: 'zzzz' } });
    expect(screen.getByText('Scope 1 greenhouse gas emissions')).toBeInTheDocument();
    expect(screen.getByText('Governance body responsible for oversight')).toBeInTheDocument();
  });

  it('shows a no-match message with Clear search, which brings the rows back', async () => {
    await renderPage();
    const ifrsSearch = screen.getByLabelText('Search IFRS indicators');
    fireEvent.change(ifrsSearch, { target: { value: 'zzzz' } });
    expect(screen.getByText('No IFRS indicators match “zzzz”.')).toBeInTheDocument();
    expect(screen.queryByText('Showing 0 of 2')).toBeNull();
    const emptyState = screen.getByText('No IFRS indicators match “zzzz”.').parentElement!;
    fireEvent.click(within(emptyState).getByRole('button', { name: 'Clear search' }));
    expect(ifrsSearch).toHaveValue('');
    expect(screen.getByText('Scope 1 greenhouse gas emissions')).toBeInTheDocument();
  });
});
