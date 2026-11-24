// "Cancel meeting" used to cancel instantly and email every participant
// (QA audit BM-06). The first click now only asks, in the popup's footer:
// "Cancel this meeting?" with who will be emailed, then Keep meeting / Yes.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const listMeetings = vi.fn();
const getMeeting = vi.fn();
const updateMeeting = vi.fn();

vi.mock('@/lib/api', () => ({
  meetings: {
    list: () => listMeetings(),
    get: (id: string) => getMeeting(id),
    update: (id: string, body: unknown) => updateMeeting(id, body),
    create: vi.fn(),
    minutes: { get: () => Promise.resolve({ minutes: null }), save: vi.fn() },
  },
  reports: { list: () => Promise.resolve({ reports: [] }) },
  companies: { getMyCompany: () => Promise.resolve({ id: 'co-1', fiscal_year_end_month: 12 }) },
  sarCycles: { list: () => Promise.resolve([]) },
  team: { list: () => Promise.resolve([]) },
  ApiError: class ApiError extends Error {},
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', company_id: 'co-1', role: 'admin', full_name: 'A', company_name: 'Acme' } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/ScheduleMeetingModal', () => ({ default: () => <div /> }));
vi.mock('@/components/ParticipantsPicker', () => ({ default: () => <div /> }));

import MeetingsPage from '@/pages/MeetingsPage';

/** Tomorrow as YYYY-MM-DD, so the meeting is upcoming and editable. */
function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA');
}

const meeting = (participants: string[]) => ({
  id: 'm1', user_id: 'u1', title: 'Future Investor Call', meeting_date: tomorrow(), meeting_time: '14:30:00',
  meeting_type: 'investor_call', platform: 'zoom', participants,
  agenda: '', link_or_location: 'https://zoom.us/j/1', status: 'scheduled', created_at: '', updated_at: '',
});

async function openEdit(participants: string[] = ['ali@x.com', 'sara@x.com', 'Board Chair']) {
  const m = meeting(participants);
  listMeetings.mockResolvedValue({ meetings: [m] });
  getMeeting.mockResolvedValue({ meeting: m });
  render(<MemoryRouter><MeetingsPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getAllByText('Future Investor Call').length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByText('Future Investor Call')[0]);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}

const clickCancelMeeting = () => fireEvent.click(screen.getByRole('button', { name: 'Cancel meeting' }));

describe('Cancel meeting asks first', () => {
  beforeEach(() => {
    updateMeeting.mockReset().mockResolvedValue({
      meeting: { ...meeting([]), status: 'cancelled' },
      email_sent: true,
      email_message: 'Cancellation notice sent to 2 participants.',
    });
  });

  it('does not cancel on the first click, and says who will be emailed', async () => {
    await openEdit();
    clickCancelMeeting();
    expect(updateMeeting).not.toHaveBeenCalled();
    expect(screen.getByText('Cancel this meeting?')).toBeInTheDocument();
    // "Board Chair" has no email address, so only 2 of the 3 are told.
    expect(screen.getByText('2 participants will be emailed a cancellation notice.')).toBeInTheDocument();
    // Save / Discard are out of the way while the question is open.
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('Keep meeting backs out without cancelling', async () => {
    await openEdit();
    clickCancelMeeting();
    fireEvent.click(screen.getByRole('button', { name: 'Keep meeting' }));
    expect(updateMeeting).not.toHaveBeenCalled();
    expect(screen.queryByText('Cancel this meeting?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel meeting' })).toBeInTheDocument();
  });

  it('Yes, cancel meeting cancels it once', async () => {
    await openEdit();
    clickCancelMeeting();
    const yes = screen.getByRole('button', { name: 'Yes, cancel meeting' });
    fireEvent.click(yes);
    fireEvent.click(yes); // a double click must not send two cancellations
    await waitFor(() => expect(updateMeeting).toHaveBeenCalledTimes(1));
    expect(updateMeeting).toHaveBeenCalledWith('m1', { status: 'cancelled' });
  });

  it('uses singular wording for one participant', async () => {
    await openEdit(['ali@x.com']);
    clickCancelMeeting();
    expect(screen.getByText('1 participant will be emailed a cancellation notice.')).toBeInTheDocument();
  });

  it('says plainly when nobody can be emailed', async () => {
    await openEdit(['Board Chair']);
    clickCancelMeeting();
    expect(screen.getByText('Nobody will be emailed: no participant has an email address.')).toBeInTheDocument();
  });

  it('on failure shows the error and goes back to the normal footer', async () => {
    updateMeeting.mockReset().mockRejectedValue(new Error('Network down'));
    await openEdit();
    clickCancelMeeting();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel meeting' }));
    await waitFor(() => expect(screen.getByText('Network down')).toBeInTheDocument());
    expect(screen.queryByText('Cancel this meeting?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel meeting' })).not.toBeDisabled();
  });

  it('a half-asked question does not come back after Discard and Edit', async () => {
    await openEdit();
    clickCancelMeeting();
    fireEvent.click(screen.getByRole('button', { name: 'Keep meeting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByText('Cancel this meeting?')).toBeNull();
  });
});
