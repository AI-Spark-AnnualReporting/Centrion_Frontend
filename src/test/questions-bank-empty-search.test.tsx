// A search with no matches said "No questions yet" even though questions exist
// (QA audit QB-03). Now: "No results" + what was searched + Clear search, and
// "No questions yet" only when there really are none.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const listQuestions = vi.fn();

vi.mock('@/lib/api', () => ({
  companies: { listQuestions: () => listQuestions() },
  ApiError: class ApiError extends Error {},
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', company_id: 'co-1', role: 'admin' } }),
}));

import QuestionsPage from '@/pages/QuestionsPage';

const QUESTION = {
  id: 'q1', company_id: 'co-1', report_id: 'r1', framework_indicator_id: 'fi1',
  question_text: 'What were total Scope 1 emissions?', created_by: 'u1',
  created_at: '2026-11-20T10:00:00Z', updated_at: '2026-11-20T10:00:00Z',
  indicator: {
    id: 'fi1', framework: 'GRI', source_code: '305-1', indicator_label: 'Direct (Scope 1) GHG emissions',
    esg_pillar: 'E', esg_category: 'Emissions', data_type: 'numeric', tier: null,
  },
  report: { id: 'r1', report_type: 'esg', period: 'FY2024', status: 'draft', created_at: '2026-11-01T00:00:00Z' },
};

const searchBox = () => screen.getByPlaceholderText('Search question, indicator, period…');

describe('Questions Bank empty states', () => {
  it('says "No results" (not "No questions yet") when a search matches nothing', async () => {
    listQuestions.mockResolvedValue({ company_id: 'co-1', questions: [QUESTION], total: 1 });
    render(<QuestionsPage />);
    await waitFor(() => expect(screen.getByText('What were total Scope 1 emissions?')).toBeInTheDocument());

    fireEvent.change(searchBox(), { target: { value: 'zzzz' } });
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.getByText('No questions match “zzzz”.')).toBeInTheDocument();
    expect(screen.queryByText('No questions yet')).toBeNull();
    // The badge keeps counting everything raised, not the (empty) results.
    expect(screen.getByText('1 question · 1 report')).toBeInTheDocument();
  });

  it('Clear search brings the questions back', async () => {
    listQuestions.mockResolvedValue({ company_id: 'co-1', questions: [QUESTION], total: 1 });
    render(<QuestionsPage />);
    await waitFor(() => expect(screen.getByText('What were total Scope 1 emissions?')).toBeInTheDocument());

    fireEvent.change(searchBox(), { target: { value: 'zzzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(searchBox()).toHaveValue('');
    expect(screen.getByText('What were total Scope 1 emissions?')).toBeInTheDocument();
  });

  it('shows the searched words trimmed', async () => {
    listQuestions.mockResolvedValue({ company_id: 'co-1', questions: [QUESTION], total: 1 });
    render(<QuestionsPage />);
    await waitFor(() => expect(screen.getByText('What were total Scope 1 emissions?')).toBeInTheDocument());

    fireEvent.change(searchBox(), { target: { value: '  zzzz  ' } });
    expect(screen.getByText('No questions match “zzzz”.')).toBeInTheDocument();
  });

  it('says "No questions yet" when there are none, even with something typed', async () => {
    listQuestions.mockResolvedValue({ company_id: 'co-1', questions: [], total: 0 });
    render(<QuestionsPage />);
    await waitFor(() => expect(screen.getByText('No questions yet')).toBeInTheDocument());
    expect(screen.getByText('Open a report and click any missing metric to raise a question.')).toBeInTheDocument();

    fireEvent.change(searchBox(), { target: { value: 'zzzz' } });
    expect(screen.getByText('No questions yet')).toBeInTheDocument();
    expect(screen.queryByText('No results')).toBeNull();
  });

  it('a search that does match shows the question as before', async () => {
    listQuestions.mockResolvedValue({ company_id: 'co-1', questions: [QUESTION], total: 1 });
    render(<QuestionsPage />);
    await waitFor(() => expect(screen.getByText('What were total Scope 1 emissions?')).toBeInTheDocument());

    fireEvent.change(searchBox(), { target: { value: 'scope 1' } });
    expect(screen.getByText('What were total Scope 1 emissions?')).toBeInTheDocument();
    expect(screen.queryByText('No results')).toBeNull();
  });
});
