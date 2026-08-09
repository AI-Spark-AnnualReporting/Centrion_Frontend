// The Board Report step routes, and the one fetch every step needs regardless
// of its own data: is this report locked, and what period is it for.

import { useEffect, useState } from 'react';
import { boardReports } from '@/lib/api';
import type { BoardReportDetail } from '@/types/board';
import { errorMessage, isBoardLocked } from './board-helpers';

export const BOARD_STEPS: { label: string; path: (reportId: string) => string }[] = [
  { label: 'Sources', path: (id) => `/board-report/${id}/sources` },
  { label: 'Sections', path: (id) => `/board-report/${id}/sections` },
  { label: 'Review', path: (id) => `/board-report/${id}/preview` },
  { label: 'Report', path: (id) => `/board-report/${id}/report` },
];

/** The report's own row — period, status and whether it is locked. */
export function useBoardReport(reportId: string) {
  const [summary, setSummary] = useState<BoardReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    boardReports
      .getReport(reportId)
      .then((res) => {
        if (!cancelled) setSummary(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, 'Could not load this board report.'));
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  return {
    summary,
    error,
    // The server precomputes this; `isBoardLocked` is only the fallback for a
    // response that predates the field.
    locked: summary?.locked ?? isBoardLocked(summary?.status),
    period: summary?.period ?? '',
  };
}
