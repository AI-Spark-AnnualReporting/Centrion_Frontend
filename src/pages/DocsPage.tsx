import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { documents as documentsApi, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type {
  BankDocument,
  ReportGroup,
  ReportCategory,
  CompanyDocumentBankResponse,
} from '@/types/report';

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// `file_type` arrives as ".pdf" — drop the leading dot for the icon badge.
function fileExt(fileType: string): string {
  return fileType.replace(/^\./, '');
}

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
          <div
            style={{
              display: 'inline-flex',
              flexWrap: 'wrap',
              gap: 4,
              marginBottom: 18,
              padding: 5,
              borderRadius: 999,
              background: '#F0F1F8',
            }}
          >
            {categories.map((category) => {
              const key = categoryKey(category);
              const isActive = key === categoryKey(activeCategory);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveKey(key)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '8px 16px',
                    fontSize: 12,
                    fontWeight: 700,
                    color: isActive ? '#fff' : '#5A6080',
                    background: isActive
                      ? 'linear-gradient(135deg, #5B5BE6 0%, #9B59D0 100%)'
                      : 'transparent',
                    border: 'none',
                    borderRadius: 999,
                    boxShadow: isActive ? '0 2px 8px rgba(91,91,230,.35)' : 'none',
                    cursor: 'pointer',
                    transition: 'background .15s ease, color .15s ease',
                  }}
                >
                  {category.category_name}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 7px',
                      borderRadius: 999,
                      color: isActive ? '#fff' : '#9BA3C4',
                      background: isActive ? 'rgba(255,255,255,.25)' : '#fff',
                    }}
                  >
                    {category.document_count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active category's reports */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeCategory.reports.map((report, i) => (
              <ReportCard
                key={report.cycle_id ?? report.report_id ?? report.thread_id ?? `unassigned-${i}`}
                report={report}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Stable tab key for a category — `category` is null for the Unassigned group.
function categoryKey(category: ReportCategory): string {
  return category.category ?? 'unassigned';
}

function ReportCard({ report }: { report: ReportGroup }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const threadId = report.thread_id;

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #E2E4F0',
        overflow: 'hidden',
      }}
    >
      {/* Report header — click to expand its documents. A div with role="button",
          not a real <button>, because it needs to contain the nested "Open
          thread" button below — a <button> can't legally contain one. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          width: '100%',
          textAlign: 'left',
          padding: '14px 18px',
          borderBottom: expanded ? '1px solid #ECEEF8' : 'none',
          background: '#F8F9FE',
          border: 'none',
          cursor: 'pointer',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: '#1A1D2E',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={report.report_name}
            >
              {report.report_name}
            </span>
          </div>
          {report.period && (
            <div style={{ fontSize: 10, color: '#5A6080', marginTop: 2 }}>{report.period}</div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9BA3C4' }}>
            {report.document_count} {report.document_count === 1 ? 'document' : 'documents'}
          </span>
          {/* Thread-attached documents also link back to the live conversation
              they were attached in — the card itself still expands normally
              so the documents stay browsable/downloadable here too. */}
          {threadId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/communications/threads/${threadId}`);
              }}
              title="Open this thread in Communication Hub"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 700,
                color: '#4040C8',
                background: 'rgba(64,64,200,.08)',
                border: 'none',
                borderRadius: 999,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Open thread
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path d="M5.6 2.6H2.9a.9.9 0 0 0-.9.9v7.6a.9.9 0 0 0 .9.9h7.6a.9.9 0 0 0 .9-.9V8.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M8.2 2.3h3.5v3.5M11.4 2.6L6.6 7.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {/* Chevron in a circular outline */}
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: '1.5px solid #C7CAF0',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              style={{
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform .15s ease',
              }}
            >
              <path d="M4.5 3L7.5 6L4.5 9" stroke="#4040C8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>

      {/* Documents — revealed on expand */}
      {expanded &&
        (report.documents.length === 0 ? (
          <div style={{ padding: '14px 18px', fontSize: 11, color: '#9BA3C4' }}>
            No documents in this group.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {report.documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
        ))}
    </div>
  );
}

function DocumentRow({ doc }: { doc: BankDocument }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 18px',
        borderBottom: '1px solid #ECEEF8',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'rgba(64,64,200,.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 800, color: '#4040C8', textTransform: 'uppercase' }}>
          {fileExt(doc.file_type)}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#1A1D2E',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={doc.filename}
        >
          {doc.filename}
        </div>
        <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
          {formatBytes(doc.file_size_bytes)} · Uploaded {formatDate(doc.created_at)}
        </div>
      </div>
      {doc.download_url ? (
        <a
          href={doc.download_url}
          target="_blank"
          rel="noopener noreferrer"
          download={doc.filename}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            background: '#4040C8',
            borderRadius: 8,
            textDecoration: 'none',
            flexShrink: 0,
          }}
          title="Download"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1.5v6m0 0L3.5 5m2.5 2.5L8.5 5M2 9.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download
        </a>
      ) : (
        <span
          style={{
            padding: '6px 12px',
            fontSize: 10,
            fontWeight: 700,
            color: '#9BA3C4',
            background: '#F0F1F8',
            borderRadius: 8,
            flexShrink: 0,
          }}
          title="Upload to storage failed — file is unavailable"
        >
          Unavailable
        </span>
      )}
    </div>
  );
}
