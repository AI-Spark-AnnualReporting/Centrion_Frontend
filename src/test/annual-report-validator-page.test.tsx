// The Annual Report Validator page (Admin's native entry point): the form
// gates "Validate report" on all four inputs, starting a run moves to a
// polling state, and the terminal states (completed/failed) render what the
// backend returned. Mirrors how the SAR app's own validator page behaves,
// since this is a port of it.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const start = vi.fn();
const poll = vi.fn();
const list = vi.fn();
const retry = vi.fn();
const navigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigate };
});

class MockApiError extends Error {
  constructor(public status: number, public statusText: string, public body: unknown, public url: string) {
    super(typeof body === "object" && body && "detail" in (body as Record<string, unknown>) ? String((body as Record<string, unknown>).detail) : statusText);
  }
}

vi.mock("@/lib/api", () => ({
  ApiError: MockApiError,
  sarValidator: {
    start: (form: FormData) => start(form),
    poll: (jobId: string) => poll(jobId),
    list: () => list(),
    retry: (jobId: string) => retry(jobId),
  },
}));

// Same mock shape the rest of this codebase's tests use for toasts (see
// board-index-failure-notification.test.tsx) - a plain array of calls.
const toasted: { title: string; description?: string; variant?: string }[] = [];
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (args: { title: string; description?: string; variant?: string }) => toasted.push(args) }),
}));

const { default: AnnualReportValidatorPage } = await import("@/pages/AnnualReportValidatorPage");

function uploadFile(input: HTMLElement, name: string) {
  const file = new File(["content"], name, { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("Annual Report Validator page", () => {
  beforeEach(() => {
    start.mockReset();
    poll.mockReset();
    retry.mockReset();
    navigate.mockReset();
    toasted.length = 0;
    // No previous validations by default - the gallery renders nothing, so
    // tests that don't care about it see the form exactly as before.
    list.mockReset();
    list.mockResolvedValue([]);
  });

  it("keeps Validate report disabled until the report, brief, concepts and a tone guide are all given", async () => {
    await renderPage();
    const button = screen.getByRole("button", { name: /validate report/i });
    expect(button).toBeDisabled();

    // The report field is the first file input on the page.
    uploadFile(document.querySelectorAll('input[type="file"]')[0], "report.pdf");
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Paste the strategic brief…"), {
      target: { value: "Grow responsibly." },
    });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("The message, in a sentence or two"), {
      target: { value: "Growth built on discipline." },
    });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Paste the house-style guide…"), {
      target: { value: "We say we, never leverage." },
    });
    expect(button).not.toBeDisabled();
  });

  it("starts a run and shows the live stage while it polls", async () => {
    start.mockResolvedValue({ job_id: "job_1" });
    poll.mockResolvedValue({ job_id: "job_1", status: "running", stage: "Reading the report", validation: null, error: null });

    await renderPage();
    fillMinimalForm();
    fireEvent.click(screen.getByRole("button", { name: /validate report/i }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start.mock.calls[0][0]).toBeInstanceOf(FormData);
    await waitFor(() => expect(screen.getByText("Reading the report")).toBeInTheDocument());
  });

  it("renders the validation panel once the job completes", async () => {
    start.mockResolvedValue({ job_id: "job_1" });
    poll.mockResolvedValue({
      job_id: "job_1",
      status: "completed",
      stage: null,
      validation: {
        figures_total: 0,
        figures_traced: 0,
        untraced: [],
        instruction_text: [],
        voice: [],
        preferred_words: {},
        conflicts: [],
        redundancy: [],
        brief_gaps: [],
        emphasis: null,
        sections_unchecked: [],
        sections: {},
        validated_at: "2026-10-08T00:00:00Z",
        figure_tracing: false,
        filename: "external-report.pdf",
      },
      error: null,
    });

    await renderPage();
    fillMinimalForm();
    fireEvent.click(screen.getByRole("button", { name: /validate report/i }));

    // The loader's own fill-to-100 finishing animation runs for ~1s before it
    // hands back to the page - longer than waitFor's default timeout.
    await waitFor(
      () => expect(screen.getByText(/external-report\.pdf/)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(screen.getByText("Nothing to fix")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    // Back returns to the Validator's own form, not out of the app.
    expect(screen.getByText("Set up validation")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows the job's own error and lets the admin go back", async () => {
    start.mockResolvedValue({ job_id: "job_1" });
    poll.mockResolvedValue({ job_id: "job_1", status: "failed", stage: null, validation: null, error: "The report could not be read." });

    await renderPage();
    fillMinimalForm();
    fireEvent.click(screen.getByRole("button", { name: /validate report/i }));

    await waitFor(
      () => expect(screen.getByText("The report could not be read.")).toBeInTheDocument(),
      { timeout: 3000 },
    );
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    // Back returns to the Validator's own form, not out of the app.
    expect(screen.getByText("Set up validation")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows skeleton cards while the gallery is loading, not a blank gap", () => {
    list.mockReturnValue(new Promise(() => {})); // never resolves within this test
    const { container } = render(<AnnualReportValidatorPage />);

    expect(screen.getByText("Previous validations")).toBeInTheDocument();
    expect(screen.getByText("loading…")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("lists previous validations and shows the score on a completed one", async () => {
    list.mockResolvedValue([
      { job_id: "job_done", filename: "aramco-fy25.pdf", status: "completed", created_at: "2026-10-01T00:00:00Z", score: 82, error: null },
    ]);

    await renderPage();

    await waitFor(() => expect(screen.getByText("aramco-fy25.pdf")).toBeInTheDocument());
    expect(screen.getByText("82/100")).toBeInTheDocument();
    expect(screen.getByText("Continue →")).toBeInTheDocument();
  });

  it("opens a completed card straight to its stored result, no re-run", async () => {
    list.mockResolvedValue([
      { job_id: "job_done", filename: "aramco-fy25.pdf", status: "completed", created_at: "2026-10-01T00:00:00Z", score: 82, error: null },
    ]);
    poll.mockResolvedValue({
      job_id: "job_done",
      status: "completed",
      stage: null,
      validation: {
        figures_total: 0, figures_traced: 0, untraced: [], instruction_text: [], voice: [],
        preferred_words: {}, conflicts: [], redundancy: [], brief_gaps: [], emphasis: null,
        sections_unchecked: [], sections: {}, validated_at: "2026-10-01T00:00:00Z",
        figure_tracing: false, filename: "aramco-fy25.pdf",
      },
      error: null,
    });

    await renderPage();
    await waitFor(() => expect(screen.getByText("aramco-fy25.pdf")).toBeInTheDocument());
    fireEvent.click(screen.getByText("aramco-fy25.pdf"));

    await waitFor(() => expect(screen.getByText("Nothing to fix")).toBeInTheDocument());
    expect(poll).toHaveBeenCalledWith("job_done");
    expect(start).not.toHaveBeenCalled();
  });

  it("opens a failed card to its stored error, with no extra fetch", async () => {
    list.mockResolvedValue([
      { job_id: "job_failed", filename: "unreadable.pdf", status: "failed", created_at: "2026-10-01T00:00:00Z", score: null, error: "No readable text in this report." },
    ]);

    await renderPage();
    await waitFor(() => expect(screen.getByText("unreadable.pdf")).toBeInTheDocument());
    fireEvent.click(screen.getByText("unreadable.pdf"));

    await waitFor(() => expect(screen.getByText("No readable text in this report.")).toBeInTheDocument());
    expect(poll).not.toHaveBeenCalled();
  });

  it("opens a running card back into the polling screen", async () => {
    list.mockResolvedValue([
      { job_id: "job_running", filename: "still-going.pdf", status: "running", created_at: "2026-10-01T00:00:00Z", score: null, error: null },
    ]);
    poll.mockResolvedValue({ job_id: "job_running", status: "running", stage: "Reading the report", validation: null, error: null });

    await renderPage();
    await waitFor(() => expect(screen.getByText("still-going.pdf")).toBeInTheDocument());
    fireEvent.click(screen.getByText("still-going.pdf"));

    await waitFor(() => expect(screen.getByText("Reading the report")).toBeInTheDocument());
    expect(poll).toHaveBeenCalledWith("job_running");
  });

  it("retries a completed run with no re-upload, from the results screen", async () => {
    start.mockResolvedValue({ job_id: "job_1" });
    poll.mockResolvedValue({
      job_id: "job_1", status: "completed", stage: null,
      validation: {
        figures_total: 0, figures_traced: 0, untraced: [], instruction_text: [], voice: [],
        preferred_words: {}, conflicts: [], redundancy: [], brief_gaps: [], emphasis: null,
        sections_unchecked: [], sections: {}, validated_at: "2026-10-08T00:00:00Z",
        figure_tracing: false, filename: "external-report.pdf",
      },
      error: null,
    });
    retry.mockResolvedValue({ job_id: "job_2" });

    await renderPage();
    fillMinimalForm();
    fireEvent.click(screen.getByRole("button", { name: /validate report/i }));
    await waitFor(
      () => expect(screen.getByRole("button", { name: /validate again/i })).toBeInTheDocument(),
      { timeout: 3000 },
    );

    fireEvent.click(screen.getByRole("button", { name: /validate again/i }));

    expect(retry).toHaveBeenCalledWith("job_1");
    // No form fields, no file - straight back to the polling screen.
    await waitFor(() => expect(screen.getByText("Starting…")).toBeInTheDocument());
  });

  it("retries a failed run the same way, from the failure screen", async () => {
    start.mockResolvedValue({ job_id: "job_1" });
    poll.mockResolvedValue({ job_id: "job_1", status: "failed", stage: null, validation: null, error: "The report could not be read." });
    retry.mockResolvedValue({ job_id: "job_2" });

    await renderPage();
    fillMinimalForm();
    fireEvent.click(screen.getByRole("button", { name: /validate report/i }));
    await waitFor(
      () => expect(screen.getByRole("button", { name: /validate again/i })).toBeInTheDocument(),
      { timeout: 3000 },
    );

    fireEvent.click(screen.getByRole("button", { name: /validate again/i }));

    expect(retry).toHaveBeenCalledWith("job_1");
    await waitFor(() => expect(screen.getByText("Starting…")).toBeInTheDocument());
  });

  it("reports a failed retry as a toast and leaves the failure screen as it was", async () => {
    start.mockResolvedValue({ job_id: "job_1" });
    poll.mockResolvedValue({ job_id: "job_1", status: "failed", stage: null, validation: null, error: "The report could not be read." });
    retry.mockRejectedValue(
      new MockApiError(422, "Unprocessable Content", { detail: "This run didn't save enough to retry." }, "/validation-jobs/job_1/retry"),
    );

    await renderPage();
    fillMinimalForm();
    fireEvent.click(screen.getByRole("button", { name: /validate report/i }));
    await waitFor(
      () => expect(screen.getByRole("button", { name: /validate again/i })).toBeInTheDocument(),
      { timeout: 3000 },
    );

    fireEvent.click(screen.getByRole("button", { name: /validate again/i }));

    await waitFor(() => expect(toasted).toHaveLength(1));
    expect(toasted[0]).toMatchObject({
      title: "Couldn't start the retry",
      description: "This run didn't save enough to retry.",
      variant: "destructive",
    });
    // Still on the original failure screen - not replaced by a second one.
    expect(screen.getByText("The report could not be read.")).toBeInTheDocument();
  });
});

// Renders the page and flushes the gallery's own list() fetch, so its
// (usually empty) result lands inside act() instead of after the test body
// has already moved on.
async function renderPage() {
  render(<AnnualReportValidatorPage />);
  await act(async () => {});
}

function fillMinimalForm() {
  uploadFile(document.querySelectorAll('input[type="file"]')[0], "report.pdf");
  fireEvent.change(screen.getByPlaceholderText("Paste the strategic brief…"), {
    target: { value: "Grow responsibly." },
  });
  fireEvent.change(screen.getByPlaceholderText("The message, in a sentence or two"), {
    target: { value: "Growth built on discipline." },
  });
  fireEvent.change(screen.getByPlaceholderText("Paste the house-style guide…"), {
    target: { value: "We say we, never leverage." },
  });
}
