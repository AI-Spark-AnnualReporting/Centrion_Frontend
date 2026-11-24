// The KPI Normalizer's GRI card shows the codes in reading order (2-1, 2-2 … 2-10),
// not the API's text order (2-1, 2-10, 2-11 … 2-2) — QA audit KP-04.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const API_ORDER = ['101-1', '2-1', '2-10', '2-2', '207-1', '3-1'];

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    // No reports: the catalogue cards render on their own.
    documents: { byReport: () => Promise.resolve({ reports: [] }) },
    esg: { getEvidence: () => Promise.resolve({ evidence: [] }) },
    quarterlyReports: { getFigures: () => Promise.resolve({ figures: [] }) },
    lookups: {
      frameworkIndicators: () =>
        Promise.resolve(
          API_ORDER.map((code) => ({
            framework: 'GRI',
            source_code: code,
            indicator_label: `Indicator ${code}`,
            esg_category: 'Economic',
            expected_unit: null,
          })),
        ),
      financialMetrics: () => Promise.resolve([]),
    },
  };
});
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', company_id: 'co-1', role: 'admin' } }),
}));

const { default: KPIPage } = await import('@/pages/KPIPage');

describe('KPI Normalizer GRI card order', () => {
  it('lists the GRI codes in reading order', async () => {
    render(
      <MemoryRouter>
        <KPIPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Indicator 2-10')).toBeInTheDocument());
    const shown = screen
      .getAllByText(/^Indicator /)
      .map((el) => el.textContent?.replace('Indicator ', ''));
    expect(shown).toEqual(['2-1', '2-2', '2-10', '3-1', '101-1', '207-1']);
  });
});
