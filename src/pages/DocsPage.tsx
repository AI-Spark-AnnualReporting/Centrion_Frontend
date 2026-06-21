import { useEffect, useRef, useState } from 'react';
import { documents as documentsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type {
  CompanyDocument,
  CompanyDocumentsResponse,
} from '@/types/report';

function formatBytes(bytes: number): string {
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

// Human label for where a document came from. Ad-hoc uploads have no report.
function sourceLabel(doc: CompanyDocument): string {
  if (doc.report_type === 'annual') return 'Annual report';
  if (doc.report_type === 'esg') return 'ESG report';
  return 'Ad-hoc upload';
}

export default function DocsPage() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [data, setData] = useState<CompanyDocumentsResponse | null>(null);
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
      .list<CompanyDocumentsResponse>(companyId)
      .then((res) => {
        if (requestId !== requestIdRef.current) return;
        setData(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Failed to load documents.');
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const docs = data?.documents ?? [];
  const total = data?.total ?? docs.length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E' }}>Document Bank</h2>
          <p style={{ fontSize: 11, color: '#5A6080', marginTop: 4 }}>
            Every document uploaded for your company, newest first.
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
      {!loading && !error && data && docs.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#9BA3C4' }}>
            No documents yet. Files you upload will appear here.
          </div>
        </div>
      )}

      {/* Document list */}
      {!loading && data && docs.length > 0 && (
        <div
          style={{
            background: '#fff',
            borderRadius: 14,
            border: '1px solid #E2E4F0',
            overflow: 'hidden',
          }}
        >
          {docs.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentRow({ doc }: { doc: CompanyDocument }) {
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
          {doc.file_type}
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
          {formatBytes(doc.file_size_bytes)} · {sourceLabel(doc)} · Uploaded {formatDate(doc.created_at)}
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
