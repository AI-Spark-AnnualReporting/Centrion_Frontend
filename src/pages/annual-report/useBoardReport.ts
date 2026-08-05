// The Board Report step routes, and the one fetch every step needs regardless
// of its own data: is this report locked, and what period is it for.

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { boardReports } from '@/lib/api';
import type { BoardReportSummary } from '@/types/board';
import { errorMessage, isBoardLocked } from './board-helpers';

export const BOARD_STEPS: { label: string; path: (reportId: string) => string }[] = [
  { label: 'Sources', path: (id) => `/board-report/${id}/sources` },
  { label: 'Sections', path: (id) => `/board-report/${id}/sections` },
  { label: 'Review', path: (id) => `/board-report/${id}/preview` },
  { label: 'Report', path: (id) => `/board-report/${id}/report` },
];

/**
 * The report's own row — period and status. There is no GET for a single board
 * report, so this reads the company's list and picks this one out.
 */
export function useBoardReport(reportId: string) {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const [summary, setSummary] = useState<BoardReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !reportId) return;
    let cancelled = false;
    boardReports
      .listReports(companyId)
      .then((res) => {
        if (cancelled) return;
        const found = res.reports?.find((r) => r.report_id === reportId) ?? null;
        setSummary(found);
        if (!found) setError('That board report does not exist, or belongs to another company.');
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, 'Could not load this board report.'));
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reportId]);

  return {
    summary,
    error,
    locked: isBoardLocked(summary?.status),
    period: summary?.period ?? '',
  };
}
