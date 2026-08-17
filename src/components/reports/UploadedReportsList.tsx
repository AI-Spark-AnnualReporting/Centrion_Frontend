import { useEffect, useState } from 'react';
import { documents as documentsApi, reports as reportsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// Read-only list of the Annual / ESG reports already uploaded for this company.
// Purely informational — nothing here is clickable, and it never blocks the upload
// form above it (a failed fetch renders nothing at all).

interface UploadedDoc {
  id: string;
  filename: string;
  file_size_bytes: number | null;
  report_id: string | null;
  report_type: string | null;
  created_at: string;
}

interface ReportRow {
  id: string;
  period: string | null;
}

// One card per report, carrying every document banked against it.
interface ReportEntry {
  reportId: string;
  docType: 'annual' | 'esg';
  period: string | null;
  docs: UploadedDoc[];
}

const KIND = {
  annual: { icon: '📊', title: 'Annual Report', accent: '#4040C8', tint: 'rgba(64,64,200,.10)', pillBg: '#E5E7FF' },
  esg: { icon: '🌱', title: 'Sustainability / ESG Report', accent: '#0F9D6B', tint: 'rgba(15,157,107,.10)', pillBg: '#DFF5EC' },
} as const;

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function SkeletonRow() {
  return (
    <div className="ob-up-row" style={{ borderLeft: '4px solid #E8EAF3' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EEF0F8', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ width: 140, height: 11, borderRadius: 4, background: '#EEF0F8' }} />
        <div style={{ width: 210, height: 9, borderRadius: 4, background: '#F2F3FA', marginTop: 8 }} />
      </div>
    </div>
  );
}

function ReportRowCard({ entry }: { entry: ReportEntry }) {
  const kind = KIND[entry.docType];
  const [first, ...rest] = entry.docs;
  // 'FY-unknown' is what the ingest stores when the classifier couldn't read a year —
  // a pill saying "unknown" is worse than no pill.
  const period = entry.period && entry.period !== 'FY-unknown' ? entry.period : null;

  return (
    <div className="ob-up-row" style={{ borderLeft: `4px solid ${kind.accent}`, cursor: 'default' }}>
      <div
        style={{
          width: 38, height: 38, borderRadius: 10, background: kind.tint,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 19, lineHeight: 1, flexShrink: 0,
        }}
      >
        {kind.icon}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1D2E' }}>{kind.title}</div>
        <div
          style={{ fontSize: 11.5, color: '#5A6080', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={first?.filename}
        >
          {first?.filename ?? '—'}
        </div>
        <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2 }}>
          {formatBytes(first?.file_size_bytes ?? null)} · uploaded {first ? formatDate(first.created_at) : '—'}
          {rest.length > 0 && ` · +${rest.length} more file${rest.length > 1 ? 's' : ''}`}
        </div>
      </div>

      {period && (
        <span
          style={{
            flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: kind.accent,
            background: kind.pillBg, padding: '4px 10px', borderRadius: 999,
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {period}
        </span>
      )}
    </div>
  );
}

export default function UploadedReportsList() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [entries, setEntries] = useState<ReportEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    Promise.all([
      documentsApi.list<{ documents?: UploadedDoc[] }>(companyId),
      // Only supplies the period pill — the list still renders fine without it.
      reportsApi.list<{ reports?: ReportRow[] }>(companyId).catch(() => null),
    ])
      .then(([docRes, repRes]) => {
        if (cancelled) return;
        const periodById = new Map(
          (repRes?.reports ?? []).map((r) => [r.id, r.period ?? null] as const),
        );

        // report_id must be set: the SAR annual-reporting backend banks department
        // questionnaires into the same table with report_type='annual' and no report_id,
        // and those are not uploaded reports.
        const byReport = new Map<string, ReportEntry>();
        for (const d of docRes?.documents ?? []) {
          if (!d.report_id) continue;
          if (d.report_type !== 'annual' && d.report_type !== 'esg') continue;
          const existing = byReport.get(d.report_id);
          if (existing) {
            existing.docs.push(d);
          } else {
            byReport.set(d.report_id, {
              reportId: d.report_id,
              docType: d.report_type,
              period: periodById.get(d.report_id) ?? null,
              docs: [d],
            });
          }
        }

        setEntries([...byReport.values()]);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries(null);   // supplementary section — stay silent on failure
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [companyId]);

  if (!loading && !entries) return null;

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Your Uploaded Reports</h2>
        {entries && entries.length > 0 && (
          <span style={{ fontSize: 11, color: '#9BA3C4', fontWeight: 600 }}>
            {entries.length} report{entries.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : entries!.length === 0 ? (
        <div
          style={{
            padding: '26px 18px', textAlign: 'center', borderRadius: 12,
            border: '1px dashed #D8DCEF', background: '#FAFBFE',
            fontSize: 12, color: '#9BA3C4',
          }}
        >
          Nothing uploaded yet — your annual and ESG reports will appear here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries!.map((e) => (
            <ReportRowCard key={e.reportId} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}
