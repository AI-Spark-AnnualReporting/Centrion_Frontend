import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { documents as documentsApi, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CategoryTabs, ReportCard, categoryKey } from '@/components/docs/DocumentBankGroups';
import type { CompanyDocumentBankResponse } from '@/types/report';

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "You don't have access to this company.";
    if (err.status === 404) return 'Company not found.';
  }
  return err instanceof Error ? err.message : 'Failed to load documents.';
}

export default function DocsPage() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const navigate = useNavigate();

  const [data, setData] = useState<CompanyDocumentBankResponse | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = () => {
    if (!companyId) {
      setError('No company associated with this account.');
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    documentsApi
      .companyDocumentBank<CompanyDocumentBankResponse>(companyId)
      .then((res) => {
        if (requestId !== requestIdRef.current) return;
        setData(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
        setError(errorMessage(err));
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const categories = data?.categories ?? [];
  const total = data?.total ?? 0;
  // Active tab: the selected category if it still exists, else the first one.
  const activeCategory =
    categories.find((c) => categoryKey(c) === activeKey) ?? categories[0] ?? null;

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E' }}>Document Bank</h2>
          <p style={{ fontSize: 11, color: '#5A6080', marginTop: 4 }}>
            Every uploaded document, grouped by category and report.
            {data && (
              <> &middot; {total} document{total === 1 ? '' : 's'}</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            color: '#4040C8',
            background: 'rgba(64,64,200,.06)',
            border: '1px solid rgba(64,64,200,.25)',
            borderRadius: 8,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#9BA3C4', fontSize: 13 }}>
          <div className="proc-ring" style={{ margin: '0 auto 12px', width: 32, height: 32, borderWidth: 2.5 }} />
          Loading documents…
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div
          style={{
            background: 'rgba(239,68,68,.04)',
            border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 12,
            padding: '14px 18px',
            color: '#DC2626',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && data && categories.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#9BA3C4' }}>
            No documents yet. Files you upload will appear here.
          </div>
        </div>
      )}

      {/* Category tabs → active category's reports → documents */}
      {!loading && data && categories.length > 0 && activeCategory && (
        <div>
          {/* Tabs — pill bar with a gradient active tab */}
          <CategoryTabs
            categories={categories}
            activeKey={categoryKey(activeCategory)}
            onSelect={setActiveKey}
          />

          {/* Active category's reports */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeCategory.reports.map((report, i) => (
              <ReportCard
                key={report.cycle_id ?? report.report_id ?? report.thread_id ?? `unassigned-${i}`}
                report={report}
                onOpenThread={(threadId) => navigate(`/communications/threads/${threadId}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
