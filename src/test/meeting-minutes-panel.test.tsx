// Minutes of meeting. Two things inspection can't settle:
//
//   • Attendance defaults to "attended" for anyone the saved record says
//     nothing about, so a fresh minutes sheet doesn't claim everyone was absent.
//   • The saved payload is rebuilt from the meeting's CURRENT participant list,
//     so someone dropped from the invite list after the minutes were written
//     doesn't linger in the record.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getMinutes = vi.fn();
const saveMinutes = vi.fn();

vi.mock('@/lib/api', () => ({
  meetings: { minutes: { get: (id: string) => getMinutes(id), save: (id: string, body: unknown) => saveMinutes(id, body) } },
  ApiError: class ApiError extends Error {
    constructor(public status: number) { super(String(status)); }
  },
}));

import MeetingMinutesPanel from '@/components/MeetingMinutesPanel';
import type { Meeting } from '@/types/meeting';

const meeting = {
  id: 'm1',
  user_id: 'u1',
  title: 'Q3 Board Meeting',
  meeting_date: '2026-08-12',
  meeting_time: '14:30:00',
  meeting_type: 'board_meeting',
  platform: 'zoom',
  participants: ['ali@x.com', 'sara@x.com'],
  agenda: 'Results',
  link_or_location: 'https://zoom.us/j/1',
  status: 'completed',
  created_at: '',
  updated_at: '',
} satisfies Meeting;

describe('MeetingMinutesPanel', () => {
  beforeEach(() => {
    getMinutes.mockReset();
    saveMinutes.mockReset();
    saveMinutes.mockResolvedValue({ minutes: null });
  });

  it('treats participants with no recorded answer as attended', async () => {
    // Only sara has an answer on file, and it says she was absent.
    getMinutes.mockResolvedValue({
      minutes: {
        meeting_id: 'm1', notes: '', decision_taken: '', decision_under_review: '',
        decision_abandoned: '', attendance: { 'sara@x.com': 'absent' },
      },
    });

    render(<MeetingMinutesPanel meeting={meeting} canEdit onClose={vi.fn()} />);

    // ali is unrecorded → attended; sara is explicitly absent.
    await waitFor(() => expect(screen.getByText('1 of 2 attended', { exact: false })).toBeTruthy());
    expect(screen.getByLabelText('ali@x.com attended').getAttribute('data-state')).toBe('checked');
    expect(screen.getByLabelText('sara@x.com attended').getAttribute('data-state')).toBe('unchecked');
  });

  it('saves attendance for the meeting’s current roster, dropping stale entries', async () => {
    // The record still carries someone who has since been removed from the meeting.
    getMinutes.mockResolvedValue({
      minutes: {
        meeting_id: 'm1', notes: 'Discussed budget.', decision_taken: '', decision_under_review: '',
        decision_abandoned: '', attendance: { 'ali@x.com': 'present', 'gone@x.com': 'absent' },
      },
    });

    render(<MeetingMinutesPanel meeting={meeting} canEdit onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('ali@x.com attended')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('ali@x.com attended'));
    fireEvent.click(screen.getByText('Save minutes'));

    await waitFor(() => expect(saveMinutes).toHaveBeenCalled());
    const [id, body] = saveMinutes.mock.calls[0];
    expect(id).toBe('m1');
    expect(body.attendance).toEqual({ 'ali@x.com': 'absent', 'sara@x.com': 'present' });
    expect(body.notes).toBe('Discussed budget.');
  });

  it('still reads records saved with the old boolean shape', async () => {
    getMinutes.mockResolvedValue({
      minutes: {
        meeting_id: 'm1', notes: '', decision_taken: '', decision_under_review: '',
        decision_abandoned: '', attendance: { 'ali@x.com': true, 'sara@x.com': false },
      },
    });

    render(<MeetingMinutesPanel meeting={meeting} canEdit onClose={vi.fn()} />);

    // Booleans read correctly: ali true → attended, sara false → absent.
    await waitFor(() => expect(screen.getByText('1 of 2 attended', { exact: false })).toBeTruthy());
    // Re-encoding alone is not a change worth saving, so make a real one.
    fireEvent.click(screen.getByLabelText('ali@x.com attended'));
    fireEvent.click(screen.getByText('Save minutes'));

    // Read as booleans, written back as words.
    await waitFor(() => expect(saveMinutes).toHaveBeenCalled());
    expect(saveMinutes.mock.calls[0][1].attendance).toEqual({
      'ali@x.com': 'absent', 'sara@x.com': 'absent',
    });
  });

  it('renders an empty sheet when no minutes exist yet', async () => {
    getMinutes.mockResolvedValue({ minutes: null });

    render(<MeetingMinutesPanel meeting={meeting} canEdit onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Decision Taken')).toBeTruthy());
    expect(screen.getByText('Decision Under Review')).toBeTruthy();
    expect(screen.getByText('Decision Abandoned')).toBeTruthy();
    expect(screen.getByText('2 of 2 attended', { exact: false })).toBeTruthy();
  });

  // `attachment_text` is the file's text, kept apart from `notes` so that what
  // the user typed is never overwritten by an upload.
  it('shows the text read out of an attachment without touching the notes', async () => {
    getMinutes.mockResolvedValue({
      minutes: {
        meeting_id: 'm1', notes: 'What I typed.', decision_taken: '', decision_under_review: '',
        decision_abandoned: '', attendance: {},
        attachment_name: 'minutes.pdf', attachment_url: 'https://x/f?token=1',
        attachment_text: 'Read out of the PDF.',
      },
    });

    render(<MeetingMinutesPanel meeting={meeting} canEdit onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/text read from minutes\.pdf/i)).toBeTruthy());
    expect(screen.getByText('Read out of the PDF.')).toBeTruthy();
    // The notes box still holds only what the user wrote.
    expect(screen.getByDisplayValue('What I typed.')).toBeTruthy();
  });

  it('says so when the attached file has no readable text', async () => {
    // A scanned PDF: uploaded fine, but there's no text layer to extract.
    getMinutes.mockResolvedValue({
      minutes: {
        meeting_id: 'm1', notes: '', decision_taken: '', decision_under_review: '',
        decision_abandoned: '', attendance: {},
        attachment_name: 'scanned-minutes.pdf', attachment_url: 'https://x/f?token=1',
        attachment_text: '',
      },
    });

    render(<MeetingMinutesPanel meeting={meeting} canEdit onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/no readable text in scanned-minutes\.pdf/i)).toBeTruthy());
  });

  it('leaves the notes the user typed alone when saving with a file', async () => {
    getMinutes.mockResolvedValue({ minutes: null });
    saveMinutes.mockResolvedValue({
      minutes: {
        meeting_id: 'm1', notes: 'Typed by hand.', decision_taken: '', decision_under_review: '',
        decision_abandoned: '', attendance: {}, attachment_name: 'minutes.pdf',
        attachment_url: 'https://x/f?token=1', attachment_text: 'Different text from the file.',
      },
    });

    render(<MeetingMinutesPanel meeting={meeting} canEdit onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Save minutes')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('What was discussed…'), {
      target: { value: 'Typed by hand.' },
    });
    const input = document.getElementById('minutes-file-m1') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'minutes.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByText('Save minutes'));

    await waitFor(() => expect(screen.getByText('Minutes saved.')).toBeTruthy());
    expect(saveMinutes.mock.calls[0][1].notes).toBe('Typed by hand.');
    expect(screen.getByDisplayValue('Typed by hand.')).toBeTruthy();
  });

  it('disables Save until something actually changes', async () => {
    getMinutes.mockResolvedValue({
      minutes: {
        meeting_id: 'm1', notes: 'testing', decision_taken: '', decision_under_review: '',
        decision_abandoned: '', attendance: { 'ali@x.com': 'present', 'sara@x.com': 'present' },
      },
    });

    render(<MeetingMinutesPanel meeting={meeting} canEdit onClose={vi.fn()} />);

    // Loaded and untouched: nothing to save.
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(screen.getByText('Saved').hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByDisplayValue('testing'), { target: { value: 'testing more' } });

    const btn = screen.getByText('Save minutes');
    expect(btn.hasAttribute('disabled')).toBe(false);

    // …and back off again once the edit is undone.
    fireEvent.change(screen.getByDisplayValue('testing more'), { target: { value: 'testing' } });
    await waitFor(() => expect(screen.getByText('Saved').hasAttribute('disabled')).toBe(true));
  });

  it('re-disables Save after a successful save', async () => {
    getMinutes.mockResolvedValue({ minutes: null });
    saveMinutes.mockResolvedValue({
      minutes: {
        meeting_id: 'm1', notes: 'Written up.', decision_taken: '', decision_under_review: '',
        decision_abandoned: '', attendance: { 'ali@x.com': 'present', 'sara@x.com': 'present' },
      },
    });

    render(<MeetingMinutesPanel meeting={meeting} canEdit onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Save minutes')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('What was discussed…'), {
      target: { value: 'Written up.' },
    });
    fireEvent.click(screen.getByText('Save minutes'));

    await waitFor(() => expect(screen.getByText('Minutes saved.')).toBeTruthy());
    expect(screen.getByText('Saved').hasAttribute('disabled')).toBe(true);
  });

  // 404 means the meeting is missing or isn't ours. "No minutes yet" is a 200
  // carrying null, so a 404 must never be swallowed as an empty sheet.
  it('surfaces a 404 instead of showing a blank sheet', async () => {
    getMinutes.mockRejectedValue(Object.assign(new Error('Meeting not found'), { status: 404 }));

    render(<MeetingMinutesPanel meeting={meeting} canEdit onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Meeting not found')).toBeTruthy());
  });

  it('hides the editing controls when the user cannot write minutes', async () => {
    getMinutes.mockResolvedValue({
      minutes: {
        meeting_id: 'm1', notes: 'Read only.', decision_taken: '', decision_under_review: '',
        decision_abandoned: '', attendance: {},
      },
    });

    render(<MeetingMinutesPanel meeting={meeting} canEdit={false} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Read only.')).toBeTruthy());
    expect(screen.queryByText('Save minutes')).toBeNull();
    expect(screen.queryByText('Attach file')).toBeNull();
    expect(screen.getByLabelText('ali@x.com attended').hasAttribute('disabled')).toBe(true);
  });
});
