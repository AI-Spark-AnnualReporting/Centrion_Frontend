import { useEffect, useState } from 'react';
import { documents as documentsApi, reports as reportsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CategoryTabs, ReportCard, categoryKey } from '@/components/docs/DocumentBankGroups';
import type { BankDocument, ReportGroup, ReportCategory } from '@/types/report';

// The Annual / ESG reports already uploaded for this company, shown with the
// same category tabs → expandable report card → downloadable document rows as
// the Document Bank page (see components/docs/DocumentBankGroups).
//
// Supplementary to the upload form above it: a failed fetch renders nothing at
// all rather than pushing an error box between the form and the page.

interface UploadedDoc {
  id: string;
  filename: string;
  file_type: string | null;
  file_size_bytes: number | null;
  report_id: string | null;
  report_type: string | null;
  extraction_status: string | null;
  created_at: string;
  // Time-limited Supabase signed URL, attached by GET /documents/{company_id}
  // (null when the storage object is missing). No backend work needed to
  // download — the row already carries the link.
  download_url: string | null;
  download_expires_at: string | null;
}

interface ReportRow {
  id: string;
  period: string | null;
}

type DocType = 'annual' | 'esg';

// Category order + labels mirror the Document Bank's backend
// (_CATEGORY_ORDER / _REPORT_TITLES in routes/document_routes.py) so the tabs
// here read identically to the ones on /docs.
const CATEGORIES: { key: DocType; name: string }[] = [
  { key: 'annual', name: 'Annual Report' },
  { key: 'esg', name: 'ESG Sustainability Report' },
];

// 'FY-unknown' is what the ingest stores when the classifier couldn't read a
// year — showing "unknown" is worse than showing nothing.
function displayPeriod(period: string | null): string | null {
  return period && period !== 'FY-unknown' ? period : null;
}

function SkeletonCard() {
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E4F0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#F8F9FE' }}>
        <div>
          <div style={{ width: 180, height: 11, borderRadius: 4, background: '#EEF0F8' }} />
          <div style={{ width: 70, height: 9, borderRadius: 4, background: '#F2F3FA', marginTop: 7 }} />
        </div>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#EEF0F8' }} />
      </div>
    </div>
  );
}

// documents.list returns the whole row; keep only what the bank UI renders.
function toBankDocument(d: UploadedDoc): BankDocument {
  return {
    id: d.id,
    filename: d.filename,
    file_type: d.file_type ?? '',
    file_size_bytes: d.file_size_bytes,
    extraction_status: d.extraction_status ?? '',
    created_at: d.created_at,
    download_url: d.download_url ?? null,
    download_expires_at: d.download_expires_at ?? null,
  };
}

function buildCategories(
  docs: UploadedDoc[],
  periodById: Map<string, string | null>,
): ReportCategory[] {
  // One group per report, carrying every document banked against it.
  // report_id must be set: the SAR annual-reporting backend banks department
  // questionnaires into the same table with report_type='annual' and no
  // report_id, and those are not uploaded reports.
  const byReport = new Map<string, { docType: DocType; group: ReportGroup }>();

  for (const d of docs) {
    if (!d.report_id) continue;
    if (d.report_type !== 'annual' && d.report_type !== 'esg') continue;
    const docType: DocType = d.report_type;

    const existing = byReport.get(d.report_id);
    if (existing) {
      existing.group.documents.push(toBankDocument(d));
      continue;
    }

    const period = displayPeriod(periodById.get(d.report_id) ?? null);
    const title = CATEGORIES.find((c) => c.key === docType)!.name;
    byReport.set(d.report_id, {
      docType,
      group: {
        report_id: d.report_id,
        cycle_id: null,
        thread_id: null,
        report_name: period ? `${title} — ${period}` : title,
        report_type: docType,
        period,
        status: null,
        document_count: 0,   // filled below, once every document has landed
        documents: [toBankDocument(d)],
      },
    });
  }

  const entries = [...byReport.values()];
  for (const e of entries) e.group.document_count = e.group.documents.length;

  // Emit a tab only when it has something in it.
  return CATEGORIES.flatMap(({ key, name }) => {
    const groups = entries.filter((e) => e.docType === key).map((e) => e.group);
    if (groups.length === 0) return [];
    return [{
      category: key,
      category_name: name,
      report_count: groups.length,
      document_count: groups.reduce((n, g) => n + g.document_count, 0),
      reports: groups,
    }];
  });
}

export default function UploadedReportsList() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [categories, setCategories] = useState<ReportCategory[] | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    Promise.all([
      documentsApi.list<{ documents?: UploadedDoc[] }>(companyId),
      // Only supplies the period in each card's title — the list still renders
      // fine without it.
      reportsApi.list<{ reports?: ReportRow[] }>(companyId).catch(() => null),
    ])
      .then(([docRes, repRes]) => {
        if (cancelled) return;
        const periodById = new Map<string, string | null>(
          (repRes?.reports ?? []).map((r) => [r.id, r.period ?? null] as const),
        );
        setCategories(buildCategories(docRes?.documents ?? [], periodById));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCategories(null);   // supplementary section — stay silent on failure
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [companyId]);

  if (!loading && !categories) return null;

  const cats = categories ?? [];
  // Active tab: the selected category if it still exists, else the first one.
  const activeCategory = cats.find((c) => categoryKey(c) === activeKey) ?? cats[0] ?? null;
  const totalDocs = cats.reduce((n, c) => n + c.document_count, 0);

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Your Uploaded Reports</h2>
        {totalDocs > 0 && (
          <span style={{ fontSize: 11, color: '#9BA3C4', fontWeight: 600 }}>
            {totalDocs} document{totalDocs === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : !activeCategory ? (
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
        <div>
          <CategoryTabs
            categories={cats}
            activeKey={categoryKey(activeCategory)}
            onSelect={setActiveKey}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeCategory.reports.map((report) => (
              <ReportCard key={report.report_id} report={report} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
