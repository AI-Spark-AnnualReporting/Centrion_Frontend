// The banner that tells an admin which departments their own annual report implies.
//
// Why it matters: the suggestion is frozen at the company's FIRST annual report, so a
// banner that shows at the wrong moment — before anything was analysed, when nothing is
// missing, or after it was dismissed — is one they can never get rid of. The "renders
// nothing" cases below are the important ones.
//
// It shows the COMPLETE list the report implied, not just the gaps, because "here is what
// your reporting involves" is the useful frame; status is carried by styling rather than
// by printing the same names twice under two headings.
//
// And it is advice, never action: picking a name must hand the name back to the caller for
// the normal Add Department form. Nothing here may create a department.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDepartmentSuggestions = vi.fn();
const dismissDepartmentSuggestions = vi.fn().mockResolvedValue({ success: true });

vi.mock('@/lib/api', () => ({
  companies: { getDepartmentSuggestions, dismissDepartmentSuggestions },
}));

const { DepartmentSuggestionsBanner } = await import(
  '@/components/shared/DepartmentSuggestionsBanner'
);
const { refreshDepartmentSuggestions } = await import('@/lib/department-suggestions');

const PAYLOAD = {
  suggested: [
    { name: 'Finance Department', rank: 1 },
    { name: 'Legal Department', rank: 2 },
    { name: 'Sustainability', rank: 3 },
  ],
  missing: [
    { name: 'Legal Department', rank: 2 },
    { name: 'Sustainability', rank: 3 },
  ],
  dismissed: false,
  source_report_id: 'rep_1',
  extracted_at: '2026-09-17T12:00:00Z',
};

// The compact variant links out, so it needs router context.
const mount = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  getDepartmentSuggestions.mockReset().mockResolvedValue(PAYLOAD);
  dismissDepartmentSuggestions.mockClear();
  // The loader caches one promise per company so the banner and the top-bar button
  // share a single request. That cache is module-level, so it outlives a test —
  // clear it, or every case after the first sees the first case's payload.
  refreshDepartmentSuggestions();
});

describe('the complete list', () => {
  it('names every department the report implied, once each', async () => {
    mount(<DepartmentSuggestionsBanner companyId="cmp_1" />);

    expect(await screen.findByText(/these departments shape your reporting/i)).toBeInTheDocument();
    // Each name appears exactly once — the old two-list layout printed the gaps twice.
    expect(screen.getAllByText('Finance Department')).toHaveLength(1);
    expect(screen.getAllByText('Legal Department')).toHaveLength(1);
    expect(screen.getAllByText('Sustainability')).toHaveLength(1);
  });

  it('says where the list came from', async () => {
    mount(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    expect(await screen.findByText(/from your last annual report/i)).toBeInTheDocument();
  });

  it('counts the gap in words', async () => {
    mount(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    expect(await screen.findByText(/Two of them aren't set up yet/i)).toBeInTheDocument();
  });

  it('uses the singular when only one is missing', async () => {
    getDepartmentSuggestions.mockResolvedValue({
      ...PAYLOAD,
      missing: [{ name: 'Sustainability', rank: 3 }],
    });
    mount(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    expect(await screen.findByText(/One of them isn't set up yet/i)).toBeInTheDocument();
  });

  it('only the missing ones are actionable', async () => {
    const onCreate = vi.fn();
    mount(<DepartmentSuggestionsBanner companyId="cmp_1" onCreate={onCreate} />);

    await screen.findByText(/these departments shape your reporting/i);
    // A department they already have is not a button.
    expect(screen.queryByTitle('Add "Finance Department" as a department')).toBeNull();
    expect(screen.getByTitle('Add "Legal Department" as a department')).toBeInTheDocument();
  });
});

describe('full variant', () => {
  it('hands a picked name back instead of creating anything', async () => {
    const onCreate = vi.fn();
    mount(<DepartmentSuggestionsBanner companyId="cmp_1" onCreate={onCreate} />);

    fireEvent.click(await screen.findByTitle('Add "Sustainability" as a department'));
    expect(onCreate).toHaveBeenCalledWith('Sustainability');
  });

  it('dismissing hides it and tells the backend, so it stays gone for everyone', async () => {
    mount(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    await screen.findByText(/these departments shape your reporting/i);

    fireEvent.click(screen.getByLabelText('Dismiss'));

    await waitFor(() =>
      expect(screen.queryByText(/these departments shape your reporting/i)).not.toBeInTheDocument(),
    );
    expect(dismissDepartmentSuggestions).toHaveBeenCalledWith('cmp_1');
  });

  it('does not link away — they are already on the departments page', async () => {
    mount(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    await screen.findByText(/these departments shape your reporting/i);
    expect(screen.queryByRole('link', { name: /manage departments/i })).toBeNull();
  });
});

describe('compact variant', () => {
  it('links to the departments page and takes its data as a prop', () => {
    mount(<DepartmentSuggestionsBanner variant="compact" data={PAYLOAD} />);

    expect(getDepartmentSuggestions).not.toHaveBeenCalled();
    expect(screen.getByText('Finance Department')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage departments/i })).toHaveAttribute(
      'href',
      '/admin-console/departments',
    );
  });

  it('is read-only mid-form: no dismiss, nothing to click', () => {
    mount(<DepartmentSuggestionsBanner variant="compact" data={PAYLOAD} />);
    expect(screen.queryByLabelText('Dismiss')).toBeNull();
    expect(screen.queryByTitle(/as a department$/)).toBeNull();
  });

  it('renders nothing when the parent has no payload', () => {
    const { container } = mount(<DepartmentSuggestionsBanner variant="compact" data={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('renders nothing when there is nothing to say', () => {
  it('no annual report analysed yet', async () => {
    getDepartmentSuggestions.mockResolvedValue({
      suggested: [], missing: [], dismissed: false,
      source_report_id: null, extracted_at: null,
    });
    const { container } = mount(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    await waitFor(() => expect(getDepartmentSuggestions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('they already have everything the report implied', async () => {
    getDepartmentSuggestions.mockResolvedValue({ ...PAYLOAD, missing: [] });
    const { container } = mount(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    await waitFor(() => expect(getDepartmentSuggestions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('already dismissed', async () => {
    getDepartmentSuggestions.mockResolvedValue({ ...PAYLOAD, dismissed: true });
    const { container } = mount(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    await waitFor(() => expect(getDepartmentSuggestions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('the fetch failed — advice is not worth an error state', async () => {
    getDepartmentSuggestions.mockRejectedValue(new Error('boom'));
    const { container } = mount(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    await waitFor(() => expect(getDepartmentSuggestions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('no company id — never calls the endpoint', () => {
    const { container } = mount(<DepartmentSuggestionsBanner companyId={null} />);
    expect(getDepartmentSuggestions).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
