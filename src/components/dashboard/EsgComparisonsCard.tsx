import { useEffect, useState } from 'react';
import { reports as reportsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CoverageByReportChart } from '@/components/dashboard/DashboardESG';

/**
 * ESG Comparisons — the ESG-tab "Coverage by Report" chart reused on Home under a
 * different title. Self-contained: fetches the company's ESG reports (which carry an
 * inline coverage block) and hands them to the shared chart. The ESG tab is untouched.
 */

interface EsgReportRow {
  id: string;
  period: string;
  report_type?: string | null;
  generated_at?: string | null;
  title?: string | null;
  coverage?: { percentage?: number | null; metrics_total?: number | null; metrics_disclosed?: number | null } | null;
}

export function EsgComparisonsCard() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const [reports, setReports] = useState<EsgReportRow[]>([]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    reportsApi
      .list<{ reports?: EsgReportRow[] }>(companyId)
      .then((r) => {
        if (cancelled) return;
        setReports((r?.reports ?? []).filter((x) => (x.report_type ?? '').toLowerCase() === 'esg' && x.period));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return <CoverageByReportChart reports={reports} title="ESG Comparisons" />;
}

export default EsgComparisonsCard;
