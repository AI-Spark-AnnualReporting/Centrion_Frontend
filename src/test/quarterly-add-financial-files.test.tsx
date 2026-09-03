// "Upload more files" on the extraction screen.
//
// Two things are pinned here. The Replace warning must be on screen VERBATIM: the
// user picks a button before we have read the file, and Replace deletes every figure
// on the report — including ones from files this upload never mentions. And the
// button must be absent unless the page passes a handler, because the lane component
// is rendered elsewhere with no api mock at all and must stay free of network calls.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import UserExtractionReview from '@/components/quarterly/UserExtractionReview';
import { AddFinancialFilesDialog } from '@/components/quarterly/AddFinancialFilesDialog';
import type { ExtractionReviewResponse } from '@/types/quarterly';

const addFiles = vi.fn();
const checkTables = vi.fn();
const pollState = { phase: 'running' as string, run: null as unknown };

vi.mock('@/lib/api', () => ({
  quarterlyReports: { addQuarterlyFinancialFiles: (...a: unknown[]) => addFiles(...a) },
  reports: { checkTables: (...a: unknown[]) => checkTables(...a) },
  agentRuns: { getByPollUrl: vi.fn(), getNodes: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

vi.mock('@/hooks/use-pipeline-poll', () => ({
  usePipelinePoll: () => ({ state: pollState, restart: vi.fn() }),
}));

function payload(over: Partial<ExtractionReviewResponse> = {}): ExtractionReviewResponse {
  return {
    report_id: 'r1', company_id: 'c1', run_id: null, awaiting_review: false,
    confirmed: [], pending: [], metrics_mode: 'user', period: 'Q3-2026',
    editable: true, sections: [], tables: [],
    financial_currency: 'SAR', financial_scale: 'millions',
    summary: { confirmed_count: 0, pending_count: 0, discarded_count: 0 },
    ...over,
  };
}

function xlsx(name = 'updated.xlsx') {
  return new File(['x'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function openDialog(props: Partial<Parameters<typeof AddFinancialFilesDialog>[0]> = {}) {
  const onDone = vi.fn();
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AddFinancialFilesDialog
        companyId="c1" reportId="r1"
        defaultCurrency="SAR" defaultScale="millions"
        onClose={onClose} onDone={onDone} {...props}
      />
    </MemoryRouter>,
  );
  return { onDone, onClose };
}

async function pickAFile(name = 'updated.xlsx') {
  const input = document.querySelector(
    'input[type="file"][accept*=".xlsx"]',
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [xlsx(name)] } });
  await waitFor(() => expect(screen.getByText(name)).toBeTruthy());
}

beforeEach(() => {
  addFiles.mockReset();
  checkTables.mockReset();
  checkTables.mockResolvedValue({ success: true, has_tables: true, table_count: 3, table_names: [], reason: null, message: null });
  addFiles.mockResolvedValue({
    runId: 'run_new', pollUrl: '/api/v1/agent_runs/run_new', reportId: 'r1',
    startedAt: 'now', estimatedDurationSeconds: 180, fileCount: 1,
    isExisting: false, outlineUnlocked: false,
  });
  pollState.phase = 'running';
  pollState.run = null;
});


describe('the button on the extraction screen', () => {
  it('is absent unless the page hands it a handler', () => {
    // The lane component's own suite renders it with no api mock. A button that
    // could open a dialog from inside it would break that harness.
    render(<MemoryRouter><UserExtractionReview reportId="r1" data={payload()} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /upload more files/i })).toBeNull();
  });

  it('opens the dialog when the page passes one', () => {
    const onAddFiles = vi.fn();
    render(
      <MemoryRouter>
        <UserExtractionReview reportId="r1" data={payload()} onAddFiles={onAddFiles} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /upload more files/i }));
    expect(onAddFiles).toHaveBeenCalled();
  });
});


describe('the upload dialog', () => {
  it('says in plain words what Replace deletes', () => {
    openDialog();
    const warning = screen.getByText(/removes every figure currently on this report/i);
    expect(warning.textContent).toMatch(/rebuilds it from this upload alone/i);
    expect(warning.textContent).toMatch(/becomes a new section named/i);
  });

  it('says the units describe the file, not the report', () => {
    openDialog();
    expect(screen.getByText(/don't change the scale the report is printed in/i)).toBeTruthy();
  });

  it('pre-fills the pickers from the report', () => {
    openDialog();
    expect((screen.getByLabelText(/currency/i) as HTMLSelectElement).value).toBe('SAR');
    expect((screen.getByLabelText(/figures are in/i) as HTMLSelectElement).value).toBe('millions');
  });

  it('offers both outcomes, and neither until a file is chosen', () => {
    openDialog();
    const keep = screen.getByRole('button', { name: /keep both/i }) as HTMLButtonElement;
    const replace = screen.getByRole('button', { name: /replace everything/i }) as HTMLButtonElement;
    expect(keep.disabled).toBe(true);
    expect(replace.disabled).toBe(true);
  });

  it('sends the choice the user pressed', async () => {
    openDialog();
    await pickAFile();
    fireEvent.click(screen.getByRole('button', { name: /keep both/i }));
    await waitFor(() => expect(addFiles).toHaveBeenCalled());
    expect(addFiles.mock.calls[0][3]).toMatchObject({ onConflict: 'keep_both', currency: 'SAR', scale: 'millions' });
  });

  it('sends replace when replace is pressed', async () => {
    openDialog();
    await pickAFile();
    fireEvent.click(screen.getByRole('button', { name: /replace everything/i }));
    await waitFor(() => expect(addFiles).toHaveBeenCalled());
    expect(addFiles.mock.calls[0][3].onConflict).toBe('replace');
  });

  it('blocks a file we could read no tables out of', async () => {
    checkTables.mockResolvedValue({
      success: true, has_tables: false, table_count: 0, table_names: [],
      reason: 'no_tables', message: "We couldn't read any tables out of 'prose.docx'.",
    });
    openDialog();
    await pickAFile('prose.docx');
    await waitFor(() =>
      expect(screen.getByText(/couldn't read any tables/i)).toBeTruthy());
    expect((screen.getByRole('button', { name: /keep both/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the backend’s own sentence when the upload is refused', async () => {
    addFiles.mockRejectedValue(new Error('Report is approved — adding financial data is not allowed'));
    openDialog();
    await pickAFile();
    fireEvent.click(screen.getByRole('button', { name: /replace everything/i }));
    await waitFor(() =>
      expect(screen.getByText(/adding financial data is not allowed/i)).toBeTruthy());
  });

  it('will not close on a backdrop click while it is working', async () => {
    const { onClose } = openDialog();
    await pickAFile();
    fireEvent.click(screen.getByRole('button', { name: /keep both/i }));
    await waitFor(() => expect(screen.getByText(/reading your files/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hands the screen the outline verdict when it finishes', async () => {
    addFiles.mockResolvedValue({
      runId: 'run_new', pollUrl: '/p', reportId: 'r1', startedAt: 'now',
      estimatedDurationSeconds: 180, fileCount: 1, isExisting: false,
      outlineUnlocked: true,
    });
    pollState.phase = 'completed';
    const { onDone } = openDialog();
    await pickAFile();
    fireEvent.click(screen.getByRole('button', { name: /replace everything/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ outlineUnlocked: true }));
  });

  it('keeps the chosen files when the run fails, so Retry is one click', async () => {
    pollState.phase = 'failed';
    pollState.run = { error_message: 'The extraction model was unreachable.' };
    openDialog();
    await pickAFile();
    fireEvent.click(screen.getByRole('button', { name: /keep both/i }));
    await waitFor(() =>
      expect(screen.getByText(/extraction model was unreachable/i)).toBeTruthy());
    expect(screen.getByText('updated.xlsx')).toBeTruthy();
  });
});
