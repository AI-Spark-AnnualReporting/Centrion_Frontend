// The top-bar shortcut to departments the annual report implies but the company lacks.
//
// Why the "renders nothing" cases matter most: this button is amber and sits next to the
// bell, so it only earns that attention when there is genuinely something to act on. If it
// showed for a company with nothing missing, or after the banner was dismissed, it would
// become wallpaper and stop being read.
//
// The gating cases are also a correctness matter, not just tidiness: only admin and
// spark_internal can reach /admin-console/departments, so showing it to anyone else hands
// them a button that silently bounces them to the dashboard. Those cases assert the
// endpoint is never even called.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDepartmentSuggestions = vi.fn();
const navigate = vi.fn();

vi.mock('@/lib/api', () => ({
  companies: { getDepartmentSuggestions, dismissDepartmentSuggestions: vi.fn() },
}));

let auth: { user: Record<string, unknown> | null; actingCompany: unknown } = {
  user: null,
  actingCompany: null,
};
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

const { SuggestedDeptButton } = await import('@/components/layout/SuggestedDeptButton');
const { refreshDepartmentSuggestions } = await import('@/lib/department-suggestions');

const WITH_GAPS = {
  suggested: [{ name: 'Legal Department', rank: 1 }, { name: 'Finance', rank: 2 }],
  missing: [{ name: 'Legal Department', rank: 1 }],
  dismissed: false,
  source_report_id: 'rep_1',
  extracted_at: '2026-09-17T12:00:00Z',
};

const LABEL = 'Suggested Departments';

beforeEach(() => {
  getDepartmentSuggestions.mockReset().mockResolvedValue(WITH_GAPS);
  navigate.mockReset();
  // Module-level cache — clear it or each case inherits the previous one's payload.
  refreshDepartmentSuggestions();
  auth = { user: { role: 'admin', company_id: 'cmp_1' }, actingCompany: null };
});

describe('when there is something to act on', () => {
  it('shows for an admin', async () => {
    render(<SuggestedDeptButton />);
    expect(await screen.findByText(LABEL)).toBeInTheDocument();
  });

  it('shows for a Spark user acting as a company', async () => {
    auth = {
      user: { role: 'spark_internal', company_id: 'cmp_1' },
      actingCompany: { id: 'cmp_1', name: 'Aramco dept testing' },
    };
    render(<SuggestedDeptButton />);
    expect(await screen.findByText(LABEL)).toBeInTheDocument();
  });

  it('goes to the departments page', async () => {
    render(<SuggestedDeptButton />);
    fireEvent.click(await screen.findByText(LABEL));
    expect(navigate).toHaveBeenCalledWith('/admin-console/departments');
  });
});

describe('gating — never asks the server for someone who cannot use the answer', () => {
  it('hides from a non-admin, and makes no request', async () => {
    auth = { user: { role: 'project_manager', company_id: 'cmp_1' }, actingCompany: null };
    const { container } = render(<SuggestedDeptButton />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(getDepartmentSuggestions).not.toHaveBeenCalled();
  });

  it('hides from a Spark session with no acting company, and makes no request', async () => {
    // ProtectedRoute redirects these away from everything anyway.
    auth = { user: { role: 'spark_internal', company_id: null }, actingCompany: null };
    const { container } = render(<SuggestedDeptButton />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(getDepartmentSuggestions).not.toHaveBeenCalled();
  });

  it('hides when there is no company at all', async () => {
    auth = { user: { role: 'admin', company_id: null }, actingCompany: null };
    const { container } = render(<SuggestedDeptButton />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(getDepartmentSuggestions).not.toHaveBeenCalled();
  });
});

describe('renders nothing when there is nothing to say', () => {
  const hidden = async () => {
    const { container } = render(<SuggestedDeptButton />);
    await waitFor(() => expect(getDepartmentSuggestions).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  };

  it('nothing missing', async () => {
    getDepartmentSuggestions.mockResolvedValue({ ...WITH_GAPS, missing: [] });
    await hidden();
  });

  it('no annual report analysed yet', async () => {
    getDepartmentSuggestions.mockResolvedValue({
      suggested: [], missing: [], dismissed: false,
      source_report_id: null, extracted_at: null,
    });
    await hidden();
  });

  it('dismissed', async () => {
    getDepartmentSuggestions.mockResolvedValue({ ...WITH_GAPS, dismissed: true });
    await hidden();
  });

  it('the request failed — advice is never worth an error state', async () => {
    getDepartmentSuggestions.mockRejectedValue(new Error('boom'));
    await hidden();
  });
});

describe('the shared cache', () => {
  it('answers a second consumer without a second request', async () => {
    render(<SuggestedDeptButton />);
    await screen.findByText(LABEL);
    render(<SuggestedDeptButton />);
    await waitFor(() => expect(screen.getAllByText(LABEL)).toHaveLength(2));
    // One request serves the banner and the top bar both.
    expect(getDepartmentSuggestions).toHaveBeenCalledTimes(1);
  });

  it('a refresh re-reads, so a dismiss elsewhere reaches this button', async () => {
    render(<SuggestedDeptButton />);
    await screen.findByText(LABEL);

    getDepartmentSuggestions.mockResolvedValue({ ...WITH_GAPS, dismissed: true });
    refreshDepartmentSuggestions('cmp_1');

    await waitFor(() => expect(screen.queryByText(LABEL)).not.toBeInTheDocument());
    expect(getDepartmentSuggestions).toHaveBeenCalledTimes(2);
  });
});
