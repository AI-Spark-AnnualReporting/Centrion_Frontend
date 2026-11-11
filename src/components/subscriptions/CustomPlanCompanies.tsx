// Spark → Subscriptions → Custom plans: the table on the left. The companies
// that have a plan made for them (from their request), with how many plans
// each has (live / draft), a search box and 10 per page. Picking a row shows
// that company's cards on the right (SparkSubscriptionsPage).
//
// Plan: Centriton/.claude/plans/subscription-test-fixes.md (fix 5)
// Mockup: Centrion_Frontend/.claude/mockups/spark-custom-plans-mockup.html

import { useEffect, useState } from 'react';
import { sparkPlans } from '@/lib/api';
import { Pager } from '@/pages/spark/SparkLicensesPage';
import type { CustomPlanCompany } from '@/types/subscription';
import './subscriptions.css';

const COMPANIES_PER_PAGE = 10;

export function CustomPlanCompanies({ selectedId, onSelect, reloadKey }: {
  selectedId: string | null;
  onSelect: (company: CustomPlanCompany | null) => void;   // null = no company on this page
  reloadKey: number;                                      // bump after a delete / publish
}) {
  const [companies, setCompanies] = useState<CustomPlanCompany[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    sparkPlans.companies({ search, page, limit: COMPANIES_PER_PAGE })
      .then((res) => {
        if (cancelled) return;
        setCompanies(res.items);
        setTotal(res.total);
        setError('');
        // Keep the picked company if it's still on this page; else pick the first.
        const stillThere = res.items.find((company) => company.company_id === selectedId);
        onSelect(stillThere ?? res.items[0] ?? null);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load companies.'); });
    return () => { cancelled = true; };
    // onSelect / selectedId are read once per load on purpose: picking a row
    // mustn't reload the table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, reloadKey]);

  const pages = Math.max(1, Math.ceil(total / COMPANIES_PER_PAGE));

  return (
    <div className="card sub-co">
      <div className="sub-co-h">
        Companies
        <small>with a custom plan</small>
      </div>
      <input className="inp sub-co-search" placeholder="Search company…" aria-label="Search company"
        value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      {error && <div style={{ fontSize: 11, color: '#DC2626', padding: '0 14px 6px' }}>{error}</div>}
      <div className="sub-co-body">
        <table className="sub-co-table">
          <thead><tr><th>Company</th><th>Plans</th><th>Status</th></tr></thead>
          <tbody>
            {companies.length === 0 && (
              <tr><td colSpan={3} style={{ color: '#9BA3C4' }}>{search ? 'No company found.' : 'No custom plans yet.'}</td></tr>
            )}
            {companies.map((company) => (
              <tr key={company.company_id} className={company.company_id === selectedId ? 'sel' : ''}
                onClick={() => onSelect(company)} aria-selected={company.company_id === selectedId}>
                <td>{company.company_name}</td>
                <td>{company.plans}</td>
                <td>
                  {company.published > 0 && <span className="badge b-gn">{company.published} live</span>}{' '}
                  {company.drafts > 0 && <span className="badge b-gy">{company.drafts} draft</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && <Pager total={total} page={page} pages={pages} size={COMPANIES_PER_PAGE} onPage={setPage} />}
    </div>
  );
}
