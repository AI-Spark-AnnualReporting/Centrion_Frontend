// The Admin Console's License card used to mount only after /admin/overview had
// finished (the whole page sat behind one spinner), so its own ~3-4 s request
// started ~1 s late (QA audit AC-04). It now loads straight away, and stays the
// same card (no remount, no second request) when the stats arrive or fail.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const overview = vi.fn();
let cardMounts = 0;

vi.mock('@/lib/api', () => ({ adminConsole: { overview: () => overview() } }));
vi.mock('@/components/license/LicenseCard', async () => {
  const { useEffect } = await import('react');
  return {
    LicenseCard: () => {
      useEffect(() => {
        cardMounts += 1;
      }, []);
      return <div>LICENSE CARD</div>;
    },
  };
});

const { default: AdminOverviewPage } = await import('@/pages/admin/AdminOverviewPage');

const OVERVIEW = {
  active_users: 3, total_seats: 12, new_users_this_month: 1, reports_this_quarter: 2,
  reports_qoq_pct: 0, document_storage_gb: 0.04, storage_limit_gb: 500, pending_actions: 0,
  pending_invites: 0, pending_onboarding: 0, reports_by_quarter: [], recent_activity: [],
  needs_attention: [],
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminOverviewPage />
    </MemoryRouter>,
  );

describe('Admin Console: License card first', () => {
  beforeEach(() => {
    cardMounts = 0;
    overview.mockReset();
  });

  it('shows the License card while the overview is still loading', () => {
    overview.mockReturnValue(new Promise(() => {}));   // never resolves
    renderPage();
    expect(screen.getByText('LICENSE CARD')).toBeInTheDocument();
  });

  it('keeps the same card when the stats arrive (mounted once)', async () => {
    let finish: (value: unknown) => void = () => {};
    overview.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPage();
    expect(cardMounts).toBe(1);
    finish(OVERVIEW);
    await waitFor(() => expect(screen.queryByText(/Couldn’t load the overview/)).toBeNull());
    await waitFor(() => expect(screen.getByText('Reports generated')).toBeInTheDocument());
    expect(screen.getAllByText('LICENSE CARD')).toHaveLength(1);
    expect(cardMounts).toBe(1);
  });

  it('has no stat cards row and no Slack line or View integrations link', async () => {
    overview.mockResolvedValue(OVERVIEW);
    renderPage();
    await waitFor(() => expect(screen.getByText('System health')).toBeInTheDocument());
    for (const gone of ['Active users', 'Reports this quarter', 'Document storage', 'Pending actions',
      'Slack integration', 'View integrations →']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(screen.getByText('Reporting API')).toBeInTheDocument();
  });

  it('keeps the License card when the overview fails', async () => {
    overview.mockRejectedValue(new Error('Overview down'));
    renderPage();
    expect(await screen.findByText('Overview down')).toBeInTheDocument();
    expect(screen.getByText('LICENSE CARD')).toBeInTheDocument();
    expect(cardMounts).toBe(1);
  });
});
