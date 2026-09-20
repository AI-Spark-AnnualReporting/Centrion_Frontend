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
// Acting on it is always the user's click, never ours: picking one name hands it back to
// the caller for the normal Add Department form, and "Add all" creates exactly the names
// on screen. Nothing here may provision a department the user did not ask for.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDepartmentSuggestions = vi.fn();
const dismissDepartmentSuggestions = vi.fn().mockResolvedValue({ success: true });
const listDepartments = vi.fn();
const createDepartment = vi.fn();

// A vi.mock factory is not partial: every export the component tree imports has to be
// here, including the admin client "Add all" creates through.
vi.mock('@/lib/api', () => ({
  companies: { getDepartmentSuggestions, dismissDepartmentSuggestions },
  adminConsole: { listDepartments, createDepartment },
}));

const { DepartmentSuggestionsBanner } = await import(
  '@/components/shared/DepartmentSuggestionsBanner'
);
const { refreshDepartmentSuggestions } = await import('@/lib/department-suggestions');

const PAYLOAD = {
  suggested: [
    { name: 'Finance Department', rank: 1, reason: 'Compiled the financial statements.' },
    { name: 'Legal Department', rank: 2, reason: 'Wrote the compliance disclosures.' },
    { name: 'Sustainability', rank: 3, reason: 'Supplied the emissions data.' },
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
  // Two of the company's own departments, so FIN is already taken — the batch has to
  // route around it rather than 400.
  listDepartments.mockReset().mockResolvedValue({
    departments: [
      { department_code: 'FIN', department_name: 'Finance & Accounting' },
      { department_code: 'HR', department_name: 'Human Resources' },
    ],
  });
  createDepartment.mockReset().mockResolvedValue({ department: {} });
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
    // The report's own sentence rides along, so the form and "Add all" fill in the same
    // description for the same department.
    expect(onCreate).toHaveBeenCalledWith('Sustainability', 'Supplied the emissions data.');
    expect(createDepartment).not.toHaveBeenCalled();
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

describe('add all', () => {
  const mountFull = () =>
    mount(
      <DepartmentSuggestionsBanner
        companyId="cmp_1"
        onCreate={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

  it('creates the missing ones only, never the ones they already have', async () => {
    mountFull();

    fireEvent.click(await screen.findByText('Add all 2'));

    await waitFor(() => expect(createDepartment).toHaveBeenCalledTimes(2));
    const names = createDepartment.mock.calls.map((c) => c[0].department_name).sort();
    expect(names).toEqual(['Legal Department', 'Sustainability']);
  });

  it('sends the report\u2019s own sentence as the description', async () => {
    mountFull();
    fireEvent.click(await screen.findByText('Add all 2'));

    await waitFor(() => expect(createDepartment).toHaveBeenCalledTimes(2));
    const legal = createDepartment.mock.calls.find(
      (c) => c[0].department_name === 'Legal Department',
    )?.[0];
    expect(legal.description).toBe('Wrote the compliance disclosures.');
  });

  it('never reuses a code the company already has, or one from this batch', async () => {
    getDepartmentSuggestions.mockResolvedValue({
      ...PAYLOAD,
      suggested: [
        { name: 'Finance Department', rank: 1 },
        { name: 'Financial Planning', rank: 2 },
      ],
      missing: [{ name: 'Finance Department', rank: 1 }, { name: 'Financial Planning', rank: 2 }],
    });
    mountFull();

    fireEvent.click(await screen.findByText('Add all 2'));
    await waitFor(() => expect(createDepartment).toHaveBeenCalledTimes(2));

    const codes = createDepartment.mock.calls.map((c) => c[0].department_code);
    // FIN belongs to their existing Finance & Accounting; both names want it.
    expect(codes).not.toContain('FIN');
    expect(new Set(codes).size).toBe(2);
  });

  it('retries with another code when the server says that one is taken', async () => {
    // The 400 a SOFT-DELETED department causes: its code is invisible to the list and
    // still collides on insert.
    createDepartment
      .mockRejectedValueOnce(new Error('Department code already exists for this company'))
      .mockResolvedValue({ department: {} });
    mountFull();

    fireEvent.click(await screen.findByText('Add all 2'));

    await waitFor(() => expect(screen.getByText(/All set/i)).toBeInTheDocument());
    expect(createDepartment).toHaveBeenCalledTimes(3);
    const codes = createDepartment.mock.calls.map((c) => c[0].department_code);
    expect(new Set(codes).size).toBe(3);
  });

  it('says what it did, and stays put to say it', async () => {
    mountFull();
    fireEvent.click(await screen.findByText('Add all 2'));

    expect(await screen.findByText(/All set — two departments added/i)).toBeInTheDocument();
    // Still on screen even though nothing is missing any more — vanishing mid-click
    // would leave them guessing.
    expect(screen.getByText(/these departments shape your reporting/i)).toBeInTheDocument();
  });

  it('tells the caller to reload its list', async () => {
    const onAdded = vi.fn();
    mount(<DepartmentSuggestionsBanner companyId="cmp_1" onCreate={vi.fn()} onAdded={onAdded} />);

    fireEvent.click(await screen.findByText('Add all 2'));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(onAdded.mock.calls[0][0].added).toHaveLength(2);
  });

  it('one refusal does not sink the rest, and leaves that one actionable', async () => {
    createDepartment.mockImplementation((body) =>
      body.department_name === 'Sustainability'
        ? Promise.reject(new Error('Not allowed'))
        : Promise.resolve({ department: {} }),
    );
    mountFull();

    fireEvent.click(await screen.findByText('Add all 2'));

    expect(await screen.findByText(/couldn.t be added/i)).toBeInTheDocument();
    expect(screen.getByText('One added.')).toBeInTheDocument();
    // The backend's own words, so "already exists" and "not allowed" are told apart.
    expect(screen.getByText('Not allowed')).toBeInTheDocument();
    // And it can still be added by hand.
    expect(screen.getByTitle('Add "Sustainability" yourself')).toBeInTheDocument();
  });

  it('a failed list read does not stop the batch — the server re-checks anyway', async () => {
    listDepartments.mockRejectedValue(new Error('boom'));
    mountFull();

    fireEvent.click(await screen.findByText('Add all 2'));
    await waitFor(() => expect(createDepartment).toHaveBeenCalledTimes(2));
  });

  it('is not offered mid-form in the compact variant', () => {
    mount(<DepartmentSuggestionsBanner variant="compact" data={PAYLOAD} />);
    expect(screen.queryByText(/^Add all/)).toBeNull();
  });

  it('reads "Add it" when only one is missing', async () => {
    getDepartmentSuggestions.mockResolvedValue({
      ...PAYLOAD,
      missing: [{ name: 'Sustainability', rank: 3 }],
    });
    mount(<DepartmentSuggestionsBanner companyId="cmp_1" onCreate={vi.fn()} />);
    expect(await screen.findByText('Add it')).toBeInTheDocument();
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
