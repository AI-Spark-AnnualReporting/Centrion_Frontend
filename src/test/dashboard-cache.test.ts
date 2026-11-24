// The Command Center's Home cards and ESG tab fetched the same reports list 4-5
// times per Home → ESG trip, one after another (QA audit CC-02). They now share
// one request through lib/dashboard-cache.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const list = vi.fn();
const getCoverage = vi.fn();
let token: string | null = 'token-a';

vi.mock('@/lib/api', () => ({
  reports: {
    list: (companyId: string) => list(companyId),
    getCoverage: (...args: unknown[]) => getCoverage(...args),
  },
  getAuthToken: () => token,
}));

const {
  COVERAGE_FRESH_FOR_MS,
  REPORT_LIST_FRESH_FOR_MS,
  clearDashboardCache,
  loadDashboardCoverage,
  loadDashboardReportList,
} = await import(
  '@/lib/dashboard-cache'
);

const LIST = { reports: [{ id: 'r1', report_type: 'esg', period: 'FY2025' }] };

describe('shared dashboard reports list', () => {
  beforeEach(() => {
    clearDashboardCache();
    list.mockReset().mockResolvedValue(LIST);
    token = 'token-a';
  });
  afterEach(() => vi.useRealTimers());

  it('gives the four dashboard callers one request', async () => {
    const answers = await Promise.all([1, 2, 3, 4].map(() => loadDashboardReportList('cmp_1')));
    expect(list).toHaveBeenCalledTimes(1);
    expect(answers.every((a) => a === LIST)).toBe(true);
  });

  it('reuses the list for 30 s, then asks again', async () => {
    vi.useFakeTimers();
    await loadDashboardReportList('cmp_1');
    vi.advanceTimersByTime(REPORT_LIST_FRESH_FOR_MS - 1);
    await loadDashboardReportList('cmp_1');
    expect(list).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    await loadDashboardReportList('cmp_1');
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('keeps companies and logins apart', async () => {
    await loadDashboardReportList('cmp_1');
    await loadDashboardReportList('cmp_2');
    token = 'token-b';
    await loadDashboardReportList('cmp_1');
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('does not keep a failure: the next call retries', async () => {
    list.mockRejectedValueOnce(new Error('network down'));
    await expect(loadDashboardReportList('cmp_1')).rejects.toThrow('network down');
    await expect(loadDashboardReportList('cmp_1')).resolves.toBe(LIST);
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe('ESG tab coverage cache', () => {
  beforeEach(() => {
    clearDashboardCache();
    getCoverage.mockReset().mockResolvedValue({ summary: {} });
    token = 'token-a';
  });
  afterEach(() => vi.useRealTimers());

  it('asks for lean coverage (no raw evidence)', async () => {
    await loadDashboardCoverage('cmp_1', 'r1');
    expect(getCoverage).toHaveBeenCalledWith('cmp_1', 'r1', { lean: true });
  });

  it('reuses it for 60 s so switching back to the tab is instant', async () => {
    vi.useFakeTimers();
    await loadDashboardCoverage('cmp_1', 'r1');
    vi.advanceTimersByTime(COVERAGE_FRESH_FOR_MS - 1);
    await loadDashboardCoverage('cmp_1', 'r1');
    expect(getCoverage).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    await loadDashboardCoverage('cmp_1', 'r1');
    expect(getCoverage).toHaveBeenCalledTimes(2);
  });

  it('keeps reports apart', async () => {
    await loadDashboardCoverage('cmp_1', 'r1');
    await loadDashboardCoverage('cmp_1', 'r2');
    expect(getCoverage).toHaveBeenCalledTimes(2);
  });
});
