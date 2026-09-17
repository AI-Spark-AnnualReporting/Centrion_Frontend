// The banner that tells an admin which departments their own annual report implies but
// which they haven't set up.
//
// Why it matters: the suggestion is frozen at the company's FIRST annual report, so a
// banner that shows at the wrong moment — before anything was analysed, when nothing is
// missing, or after it was dismissed — is one they can never get rid of. The "renders
// nothing" cases below are the important ones.
//
// It is also advice, never action: picking a name must hand the name back to the caller
// for the normal Add Department form. Nothing here may create a department.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDepartmentSuggestions = vi.fn();
const dismissDepartmentSuggestions = vi.fn().mockResolvedValue({ success: true });

vi.mock('@/lib/api', () => ({
  companies: { getDepartmentSuggestions, dismissDepartmentSuggestions },
}));

const { DepartmentSuggestionsBanner } = await import(
  '@/components/shared/DepartmentSuggestionsBanner'
);

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

beforeEach(() => {
  getDepartmentSuggestions.mockReset().mockResolvedValue(PAYLOAD);
  dismissDepartmentSuggestions.mockClear();
});

describe('full variant', () => {
  it('shows what the report implied and what is missing', async () => {
    render(<DepartmentSuggestionsBanner companyId="cmp_1" />);

    expect(
      await screen.findByText(/we think you should have these departments/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/currently missing these ones/i)).toBeInTheDocument();
    // Finance appears once (suggested only); Legal twice (suggested + missing).
    expect(screen.getAllByText('Finance Department')).toHaveLength(1);
    expect(screen.getAllByText(/Legal Department/)).toHaveLength(2);
  });

  it('hands a picked name back instead of creating anything', async () => {
    const onCreate = vi.fn();
    render(<DepartmentSuggestionsBanner companyId="cmp_1" onCreate={onCreate} />);

    const chip = await screen.findByTitle('Add "Sustainability" as a department');
    fireEvent.click(chip);

    expect(onCreate).toHaveBeenCalledWith('Sustainability');
  });

  it('dismissing hides it and tells the backend, so it stays gone for everyone', async () => {
    render(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    await screen.findByText(/we think you should have these departments/i);

    fireEvent.click(screen.getByLabelText('Dismiss'));

    await waitFor(() =>
      expect(
        screen.queryByText(/we think you should have these departments/i),
      ).not.toBeInTheDocument(),
    );
    expect(dismissDepartmentSuggestions).toHaveBeenCalledWith('cmp_1');
  });
});

describe('renders nothing when there is nothing to say', () => {
  it('no annual report analysed yet', async () => {
    getDepartmentSuggestions.mockResolvedValue({
      suggested: [], missing: [], dismissed: false,
      source_report_id: null, extracted_at: null,
    });
    const { container } = render(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    await waitFor(() => expect(getDepartmentSuggestions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('they already have everything the report implied', async () => {
    getDepartmentSuggestions.mockResolvedValue({ ...PAYLOAD, missing: [] });
    const { container } = render(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    await waitFor(() => expect(getDepartmentSuggestions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('already dismissed', async () => {
    getDepartmentSuggestions.mockResolvedValue({ ...PAYLOAD, dismissed: true });
    const { container } = render(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    await waitFor(() => expect(getDepartmentSuggestions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('the fetch failed — advice is not worth an error state', async () => {
    getDepartmentSuggestions.mockRejectedValue(new Error('boom'));
    const { container } = render(<DepartmentSuggestionsBanner companyId="cmp_1" />);
    await waitFor(() => expect(getDepartmentSuggestions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('no company id — never calls the endpoint', () => {
    const { container } = render(<DepartmentSuggestionsBanner companyId={null} />);
    expect(getDepartmentSuggestions).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('compact variant', () => {
  it('is one line, takes its data as a prop, and fetches nothing', () => {
    render(<DepartmentSuggestionsBanner variant="compact" data={PAYLOAD} />);

    expect(getDepartmentSuggestions).not.toHaveBeenCalled();
    expect(screen.getByText(/not set up yet/i)).toBeInTheDocument();
    expect(screen.getByText('Legal Department, Sustainability')).toBeInTheDocument();
    // No dismiss mid-form: they're setting up a cycle, not managing departments.
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument();
  });

  it('renders nothing when the parent has no payload', () => {
    const { container } = render(
      <DepartmentSuggestionsBanner variant="compact" data={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
