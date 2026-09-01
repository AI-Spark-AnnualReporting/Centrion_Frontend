// The Upcoming card carries a second rail: past meetings nobody has written up
// yet. What inspection can't settle is which meetings qualify — the filter has
// four ways to exclude a row (already written up, still in the future,
// cancelled, or held) — and that clicking one lands on the Minutes form rather
// than the Details view.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const listMeetings = vi.fn();
const getMinutes = vi.fn();
const getMeeting = vi.fn();

vi.mock('@/lib/api', () => ({
  meetings: {
    list: () => listMeetings(),
    get: (id: string) => getMeeting(id),
    update: vi.fn(),
    create: vi.fn(),
    minutes: { get: (id: string) => getMinutes(id), save: vi.fn() },
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
vi.mock('@/components/ScheduleMeetingModal', () => ({ default: () => <div>schedule-modal</div> }));
vi.mock('@/components/ParticipantsPicker', () => ({ default: () => <div /> }));

import MeetingsPage from '@/pages/MeetingsPage';

const NOW = new Date(2026, 7, 4); // 4 Aug 2026

const meeting = (over: Record<string, unknown>) => ({
  id: 'm', user_id: 'u1', title: 'Meeting', meeting_date: '2026-07-12', meeting_time: '14:30:00',
  meeting_type: 'board_meeting', platform: 'zoom', participants: ['ali@x.com'],
  agenda: '', link_or_location: 'https://zoom.us/j/1', status: 'scheduled',
  created_at: '', updated_at: '', ...over,
});

// One of each exclusion path, plus the one row that should survive.
const FIXTURES = [
  meeting({ id: 'm1', title: 'Unwritten Board Meeting', meeting_date: '2026-07-12' }),
  meeting({ id: 'm2', title: 'Already Written Up', meeting_date: '2026-07-20', has_minutes: true }),
  meeting({ id: 'm3', title: 'Future Investor Call', meeting_date: '2026-08-12' }),
  meeting({ id: 'm4', title: 'Cancelled Sync', meeting_date: '2026-07-05', status: 'cancelled' }),
];

const openTab = () => fireEvent.click(screen.getByRole('button', { name: /needs minutes/i }));

// The rail's date tiles carry the same digits as the grid, so match the day
// cell itself rather than the text.
const clickDay = (n: number) => {
  const cell = Array.from(document.querySelectorAll<HTMLButtonElement>('button.cal-day'))
    .find((b) => b.textContent?.trim() === String(n));
  if (!cell) throw new Error(`No calendar cell for day ${n}`);
  fireEvent.click(cell);
};

describe('Board & Meetings — Needs Minutes rail', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    listMeetings.mockResolvedValue({ meetings: FIXTURES });
    getMinutes.mockResolvedValue({ minutes: null });
    getMeeting.mockImplementation((id: string) =>
      Promise.resolve({ meeting: FIXTURES.find((m) => m.id === id) }),
    );
  });

  it('lists only past meetings that have no minutes yet', async () => {
    render(<MemoryRouter><MeetingsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: /needs minutes/i })).toBeTruthy());
    openTab();

    expect(screen.getByText('Unwritten Board Meeting')).toBeTruthy();
    // Written up, still upcoming, and cancelled all stay out.
    expect(screen.queryByText('Already Written Up')).toBeNull();
    expect(screen.queryByText('Future Investor Call')).toBeNull();
    expect(screen.queryByText('Cancelled Sync')).toBeNull();
  });

  it('shows the outstanding count on the tab without opening it', async () => {
    render(<MemoryRouter><MeetingsPage /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /needs minutes 1/i })).toBeTruthy(),
    );
  });

  it('opens the meeting straight on its Minutes form', async () => {
    render(<MemoryRouter><MeetingsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: /needs minutes/i })).toBeTruthy());
    openTab();
    fireEvent.click(screen.getByText('Unwritten Board Meeting'));

    // The Minutes panel, not the Details rows.
    await waitFor(() => expect(screen.getByText('Decision Taken')).toBeTruthy());
    expect(screen.getByText('Decision Under Review')).toBeTruthy();
    expect(screen.getByText('Decision Abandoned')).toBeTruthy();
    expect(getMinutes).toHaveBeenCalledWith('m1');
  });

  // The day panel is how a past meeting actually gets found — the rail only
  // lists them, the calendar is where you go looking.
  it('flags meetings needing minutes on the selected-day panel', async () => {
    render(<MemoryRouter><MeetingsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: /needs minutes/i })).toBeTruthy());

    // 12 Jul 2026 — the unwritten meeting. Step back one month from Aug.
    fireEvent.click(screen.getByLabelText('Previous month'));
    clickDay(12);

    expect(screen.getByText('Unwritten Board Meeting')).toBeTruthy();
    expect(screen.getByText('Needs minutes')).toBeTruthy();

    // A past meeting already written up gets no pill.
    clickDay(20);
    expect(screen.getByText('Already Written Up')).toBeTruthy();
    expect(screen.queryByText('Needs minutes')).toBeNull();
  });

  it('drops the tab count to zero once everything is written up', async () => {
    listMeetings.mockResolvedValue({
      meetings: [meeting({ id: 'm2', title: 'Already Written Up', has_minutes: true })],
    });
    render(<MemoryRouter><MeetingsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: /needs minutes/i })).toBeTruthy());
    openTab();

    expect(screen.getByText(/All caught up/)).toBeTruthy();
    // No count pill when there is nothing outstanding.
    expect(screen.queryByRole('button', { name: /needs minutes \d/i })).toBeNull();
  });
});
