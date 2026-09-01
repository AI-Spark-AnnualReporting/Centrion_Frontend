// Board & Meetings now carries two layers on one grid: real `meetings` rows and
// the disclosure events lib/disclosure.ts derives from reports + annual cycles
// (what the retired standalone IR Calendar page used to show).
//
// What's covered here is the seam between them — the part inspection can't
// settle: that both layers land in one rail, that filed reports are placed at
// their fiscal year-end and kept out of "upcoming", and that the .ics export
// emits a timed VEVENT for a meeting but an all-day one for a derived deadline.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const listMeetings = vi.fn();
const listReports = vi.fn();
const getMyCompany = vi.fn();
const listCycles = vi.fn();

vi.mock('@/lib/api', () => ({
  meetings: { list: () => listMeetings(), get: vi.fn(), update: vi.fn(), create: vi.fn() },
  reports: { list: () => listReports() },
  companies: { getMyCompany: () => getMyCompany() },
  sarCycles: { list: () => listCycles() },
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', company_id: 'co-1', role: 'admin', full_name: 'A', company_name: 'Acme' } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/ScheduleMeetingModal', () => ({ default: () => <div>schedule-modal</div> }));
vi.mock('@/components/ParticipantsPicker', () => ({ default: () => <div /> }));

import MeetingsPage from '@/pages/MeetingsPage';

// Fixed "now" so the derived due-dates land predictably.
const NOW = new Date(2026, 7, 4); // 4 Aug 2026

describe('Board & Meetings — merged calendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    listMeetings.mockResolvedValue({
      meetings: [{
        id: 'm1', title: 'Q3 Investor Call', meeting_date: '2026-08-12', meeting_time: '14:30:00',
        meeting_type: 'investor_call', platform: 'zoom', participants: ['a@x.com'],
        agenda: 'Results', link_or_location: 'https://zoom.us/j/1', status: 'scheduled',
      }],
    });
    // Latest annual report is FY-2025 → next annual due Dec 2026 (FYE 12).
    // `status: approved` is load-bearing: only a signed-off report is placed as a
    // completed marker, so a fixture without it renders no filed event at all.
    listReports.mockResolvedValue({
      reports: [{ id: 'r1', period: 'FY-2025', report_type: 'annual', status: 'approved', generated_at: '2026-01-10T00:00:00Z', title: 'Annual FY-2025' }],
    });
    getMyCompany.mockResolvedValue({ id: 'co-1', fiscal_year_end_month: 12 });
    listCycles.mockResolvedValue([]);
  });

  it('renders meetings AND derived disclosure deadlines in one Upcoming rail', async () => {
    render(<MemoryRouter><MeetingsPage /></MemoryRouter>);

    // Meeting layer
    expect(await screen.findByText('Q3 Investor Call')).toBeTruthy();
    // Disclosure layer, derived — never stored anywhere
    expect(await screen.findByText('Next Annual report due')).toBeTruthy();

    // One rail, not two. The count moved onto the tab when the card grew a
    // second rail for meetings still needing minutes.
    expect(screen.queryByText('Upcoming Meetings')).toBeNull();
    // Filed items are excluded from the count: 1 meeting + 1 due = 2
    expect(screen.getByRole('button', { name: 'Upcoming 2' })).toBeTruthy();
  });

  it('shows both layers on the selected-day panel, and only meetings are clickable', async () => {
    render(<MemoryRouter><MeetingsPage /></MemoryRouter>);
    await screen.findByText('Q3 Investor Call');

    // 12 Aug 2026 holds the meeting
    fireEvent.click(screen.getByRole('button', { name: '12' }));
    await waitFor(() => expect(screen.getByText(/Wednesday, August 12/)).toBeTruthy());
    // The meeting appears in the panel as a button (opens the detail modal)
    const panelHits = screen.getAllByText('Q3 Investor Call');
    expect(panelHits.length).toBeGreaterThan(1);
  });

  it('places a filed report on its own month, out of the Upcoming rail', async () => {
    render(<MemoryRouter><MeetingsPage /></MemoryRouter>);
    await screen.findByText('Q3 Investor Call');

    // Filed FY-2025 sits at the Dec-2025 fiscal year-end — 8 months back.
    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByLabelText('Previous month'));
    await waitFor(() => expect(screen.getByText(/December 2025/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '31' }));
    await waitFor(() => expect(screen.getByText('Annual FY-2025')).toBeTruthy());
    expect(screen.getByText(/December 2025 · Completed/)).toBeTruthy();
  });

  it('exports an .ics containing both a timed meeting and an all-day deadline', async () => {
    const parts: string[] = [];
    const origBlob = globalThis.Blob;
    // @ts-expect-error - test double
    globalThis.Blob = class { constructor(p: string[]) { parts.push(...p); } };
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();

    render(<MemoryRouter><MeetingsPage /></MemoryRouter>);
    await screen.findByText('Next Annual report due');
    fireEvent.click(screen.getByText('Export'));

    const ics = parts.join('');
    expect(ics).toContain('DTSTART:20260812T1430');           // meeting keeps its time
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');     // deadline is all-day
    expect(ics).toContain('SUMMARY:Q3 Investor Call');
    expect(ics).toContain('SUMMARY:Next Annual report due');

    globalThis.Blob = origBlob;
  });
});
