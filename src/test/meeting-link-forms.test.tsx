// The meeting link is checked in the Schedule Meeting popup and in the edit form
// on the Meetings page (QA audit BM-03: "not a url" was saved and shown as a link).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const createMeeting = vi.fn();
const listMeetings = vi.fn();
const getMeeting = vi.fn();
const updateMeeting = vi.fn();

vi.mock('@/lib/api', () => ({
  meetings: {
    list: () => listMeetings(),
    get: (id: string) => getMeeting(id),
    update: (id: string, body: unknown) => updateMeeting(id, body),
    create: (body: unknown) => createMeeting(body),
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
vi.mock('@/components/ParticipantsPicker', () => ({ default: () => <div /> }));

import ScheduleMeetingModal from '@/components/ScheduleMeetingModal';
import MeetingsPage from '@/pages/MeetingsPage';

/** Tomorrow as YYYY-MM-DD, so the date is never "in the past". */
function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA');
}

function renderPopup() {
  render(<ScheduleMeetingModal onClose={vi.fn()} onCreated={vi.fn()} companyId="co-1" companyName="Acme" />);
  fireEvent.change(screen.getByPlaceholderText('e.g. Q2 Investor Call'), { target: { value: 'Q3 call' } });
  fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: tomorrow() } });
  fireEvent.change(document.querySelector('input[type="time"]')!, { target: { value: '10:00' } });
}

const linkInput = () => screen.getByLabelText(/meeting url|location/i) as HTMLInputElement;
const clickSchedule = () => fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));

describe('Schedule Meeting popup: meeting link', () => {
  beforeEach(() => {
    createMeeting.mockReset().mockResolvedValue({ meeting: { id: 'new' }, email_sent: null });
  });

  it('blocks "not a url" and says how to fix it, right under the field', () => {
    renderPopup();
    fireEvent.change(linkInput(), { target: { value: 'not a url' } });
    clickSchedule();
    expect(createMeeting).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Enter a full meeting link, for example https://zoom.us/j/123456789');
    expect(linkInput()).toHaveAttribute('aria-invalid', 'true');
    expect(linkInput().className).toContain('inp-error');
  });

  it('blocks a javascript: link', () => {
    renderPopup();
    fireEvent.change(linkInput(), { target: { value: 'javascript:alert(1)' } });
    clickSchedule();
    expect(createMeeting).not.toHaveBeenCalled();
  });

  it('shows the error as soon as the field is left, and clears it while retyping', () => {
    renderPopup();
    fireEvent.change(linkInput(), { target: { value: 'meet' } });
    fireEvent.blur(linkInput());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(linkInput(), { target: { value: 'meet.google.com/abc' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('adds https:// to a bare address when the field is left, and saves that', async () => {
    renderPopup();
    fireEvent.change(linkInput(), { target: { value: 'zoom.us/j/123' } });
    fireEvent.blur(linkInput());
    expect(linkInput().value).toBe('https://zoom.us/j/123');
    clickSchedule();
    await waitFor(() => expect(createMeeting).toHaveBeenCalledTimes(1));
    expect(createMeeting.mock.calls[0][0]).toMatchObject({ link_or_location: 'https://zoom.us/j/123' });
  });

  it('saves a pasted bare address correctly even without leaving the field', async () => {
    renderPopup();
    fireEvent.change(linkInput(), { target: { value: 'zoom.us/j/9' } });
    clickSchedule();
    await waitFor(() => expect(createMeeting).toHaveBeenCalledTimes(1));
    expect(createMeeting.mock.calls[0][0]).toMatchObject({ link_or_location: 'https://zoom.us/j/9' });
  });

  it('still asks for a link when the field is empty', () => {
    renderPopup();
    clickSchedule();
    expect(screen.getByRole('alert')).toHaveTextContent('A meeting URL is required.');
    expect(createMeeting).not.toHaveBeenCalled();
  });

  it('lets an in-person meeting use any text, with no link check', async () => {
    renderPopup();
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'in_person' } });
    fireEvent.change(linkInput(), { target: { value: 'Boardroom 3, Level 12' } });
    fireEvent.blur(linkInput());
    expect(screen.queryByRole('alert')).toBeNull();
    clickSchedule();
    await waitFor(() => expect(createMeeting).toHaveBeenCalledTimes(1));
    expect(createMeeting.mock.calls[0][0]).toMatchObject({ link_or_location: 'Boardroom 3, Level 12' });
  });

  it('drops a link error when the platform is switched to in-person', () => {
    renderPopup();
    fireEvent.change(linkInput(), { target: { value: 'not a url' } });
    fireEvent.blur(linkInput());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'in_person' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Meeting details: editing the link', () => {
  const meeting = (link: string) => ({
    id: 'm1', user_id: 'u1', title: 'Future Investor Call', meeting_date: tomorrow(), meeting_time: '14:30:00',
    meeting_type: 'investor_call', platform: 'zoom', participants: ['ali@x.com'],
    agenda: '', link_or_location: link, status: 'scheduled', created_at: '', updated_at: '',
  });

  async function openDetails(link: string) {
    const m = meeting(link);
    listMeetings.mockResolvedValue({ meetings: [m] });
    getMeeting.mockResolvedValue({ meeting: m });
    render(<MemoryRouter><MeetingsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText('Future Investor Call').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('Future Investor Call')[0]);
    await waitFor(() => expect(screen.getByText('Meeting URL')).toBeInTheDocument());
  }

  it('makes the admin fix an old bad link before an edit can be saved', async () => {
    updateMeeting.mockReset().mockResolvedValue({ meeting: meeting('https://zoom.us/j/2'), email_sent: null });
    await openDetails('not a url');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateMeeting).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a full meeting link');

    fireEvent.change(screen.getByLabelText(/meeting url/i), { target: { value: 'zoom.us/j/2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateMeeting).toHaveBeenCalledTimes(1));
    expect(updateMeeting.mock.calls[0][1]).toMatchObject({ link_or_location: 'https://zoom.us/j/2' });
  });
});
