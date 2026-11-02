import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { companies as companiesApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type {
  AnnualReportExtraction as Extraction,
  ExtractedDepartments,
  ExtractedFinancials,
  ExtractedReport,
  ExtractedSection,
  ReportOutlineDetail,
  ReportOutlineEntry,
} from '@/types/company';

// Everything the onboarding upload read out of the company's annual report(s),
// printed as-is under the Uploaded Reports list. Empty parts say so instead of
// disappearing, so it is visible what the ingest did NOT manage to read.

// Same category colours as the dashboard's "What we learned" card.
const HIGHLIGHT_STYLE: Record<string, { color: string; bg: string }> = {
  financial: { color: '#0F9D6B', bg: '#E7F7F0' },
  esg: { color: '#0D9488', bg: '#E2F6F3' },
  governance: { color: '#4040C8', bg: '#ECEEFF' },
  compliance: { color: '#B45309', bg: '#FDF3E2' },
  strategy: { color: '#7C3AED', bg: '#F1ECFE' },
};
const HIGHLIGHT_FALLBACK = { color: '#5A6080', bg: '#F1F2F8' };

const OUTLINE_FOLD_AT = 15;

const labelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '.6px',
  textTransform: 'uppercase',
  color: '#9BA3C4',
};
const bodyStyle: CSSProperties = { fontSize: 12, color: '#3A3F58', lineHeight: 1.55 };
const emptyStyle: CSSProperties = {
  fontSize: 11.5,
  color: '#9BA3C4',
  border: '1px dashed #D8DCEF',
  background: '#FAFBFE',
  borderRadius: 10,
  padding: '10px 12px',
};
const pillStyle: CSSProperties = {
  display: 'inline-block',
  fontSize: 10.5,
  fontWeight: 700,
  borderRadius: 999,
  padding: '3px 10px',
};

/** Loads and prints everything extracted from the company's annual report(s). */
export default function AnnualReportExtraction() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const [data, setData] = useState<Extraction | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setData(null);
    setFailed(false);
    async function loadExtraction(id: string) {
      try {
        const result = await companiesApi.getAnnualReportExtraction(id);
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    loadExtraction(companyId);
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (!companyId) return null;

  return (
    <section style={{ marginTop: 28 }} aria-label="What we extracted from your annual report">
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>
          What we extracted from your annual report
        </h2>
        <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
          Everything we read out of the annual report you uploaded, exactly as it is stored.
        </p>
      </div>
      {failed && <p style={emptyStyle}>Could not load what was extracted. Refresh to try again.</p>}
      {!failed && !data && <p style={{ ...bodyStyle, color: '#9BA3C4' }}>Loading…</p>}
      {data && <ExtractionBody data={data} />}
    </section>
  );
}

/** Every block of the panel, in the order the ingest produces them. */
function ExtractionBody({ data }: { data: Extraction }) {
  const company = data.company;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.errors.length > 0 && <PartialErrors errors={data.errors} />}
      <Block title="Writing tone">
        <ToneDirective tone={company.tone} />
      </Block>
      <Block title="Tone profile">
        <ToneDimensions dimensions={company.tone_dimensions} />
      </Block>
      <Block title="Example sentences quoted from the report">
        <Exemplars exemplars={company.tone_exemplars} />
      </Block>
      <Block title="Themes">
        <Themes themes={company.themes} />
      </Block>
      <Block title="Highlights">
        <Highlights highlights={company.highlights} />
      </Block>
      <Block title="Revenue and profit">
        <FinancialsPerReport reports={data.reports} />
      </Block>
      <Block title="Contents page">
        <ContentsPagesPerReport reports={data.reports} />
      </Block>
      <Block title="Report outline (from the first upload)">
        <FlatOutline outline={company.outline} />
      </Block>
      <Block title="Report sections created from the outline">
        <Sections sections={data.sections} />
      </Block>
      <Block title="Suggested departments">
        <Departments departments={company.departments} />
      </Block>
    </div>
  );
}

/** One white card with an uppercase label on top. */
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ ...labelStyle, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

/** The grey dashed line shown when a block has nothing in it. */
function Empty({ text = 'Nothing was extracted.' }: { text?: string }) {
  return <div style={emptyStyle}>{text}</div>;
}

/** A label on the left and its value on the right; empty values say "Not found". */
function FactRow({ label, value }: { label: string; value: ReactNode }) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div style={{ display: 'flex', gap: 12, padding: '5px 0', borderBottom: '1px solid #ECEEF8' }}>
      <div style={{ ...bodyStyle, width: 200, flexShrink: 0, color: '#5A6080' }}>{label}</div>
      <div dir="auto" style={{ ...bodyStyle, color: isEmpty ? '#9BA3C4' : '#1A1D2E', fontWeight: 600 }}>
        {isEmpty ? 'Not found' : value}
      </div>
    </div>
  );
}

/** Parts the server could not read; the rest of the panel still shows. */
function PartialErrors({ errors }: { errors: string[] }) {
  return (
    <div style={{ ...bodyStyle, color: '#B45309', background: '#FDF3E2', borderRadius: 10, padding: '10px 12px' }}>
      {errors.map((message) => (
        <div key={message}>{message}</div>
      ))}
    </div>
  );
}

function ToneDirective({ tone }: { tone: string | null }) {
  if (!tone) return <Empty />;
  return <p dir="auto" style={bodyStyle}>{tone}</p>;
}

function ToneDimensions({ dimensions }: { dimensions: Record<string, string> }) {
  const keys = Object.keys(dimensions);
  if (keys.length === 0) return <Empty />;
  return (
    <div>
      {keys.map((key) => (
        <FactRow key={key} label={humanize(key)} value={dimensions[key]} />
      ))}
    </div>
  );
}

/** Sentences copied word for word, in the report's own language. */
function Exemplars({ exemplars }: { exemplars: string[] }) {
  if (exemplars.length === 0) return <Empty />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {exemplars.map((sentence, index) => (
        <blockquote
          key={index}
          dir="auto"
          style={{ ...bodyStyle, margin: 0, padding: '8px 12px', background: '#F8F9FE', borderRadius: 8, borderInlineStart: '3px solid #4040C8' }}
        >
          {sentence}
        </blockquote>
      ))}
    </div>
  );
}

function Themes({ themes }: { themes: Extraction['company']['themes'] }) {
  if (themes.length === 0) return <Empty />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {themes.map((theme) => (
        <div key={theme.name}>
          <span style={{ ...pillStyle, background: '#ECEEFF', color: '#3B52E0' }}>{theme.name}</span>
          {theme.explanation && (
            <p dir="auto" style={{ ...bodyStyle, marginTop: 4 }}>{theme.explanation}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Highlights({ highlights }: { highlights: Extraction['company']['highlights'] }) {
  if (highlights.length === 0) return <Empty />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {highlights.map((highlight, index) => {
        const style = HIGHLIGHT_STYLE[highlight.category] ?? HIGHLIGHT_FALLBACK;
        return (
          <div key={index} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ ...pillStyle, background: style.bg, color: style.color, flexShrink: 0 }}>
              {highlight.category}
            </span>
            <span dir="auto" style={bodyStyle}>{highlight.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Revenue and profit are read per report, so each file gets its own figures. */
function FinancialsPerReport({ reports }: { reports: ExtractedReport[] }) {
  if (reports.length === 0) return <Empty />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {reports.map((report) => (
        <div key={report.document.id}>
          {reports.length > 1 && <FileCaption filename={report.document.filename} />}
          <Financials financials={report.financials} />
        </div>
      ))}
    </div>
  );
}

function Financials({ financials }: { financials: ExtractedFinancials | null }) {
  if (!financials || !financials.data) return <Empty />;
  const data = financials.data;
  const firstPeriod = data.periods?.[0];
  const items = firstPeriod?.line_items ?? {};
  const deltas = data.yoy_deltas ?? {};
  return (
    <div>
      <FactRow label="Stored under fiscal year" value={financials.period} />
      <FactRow label="Period printed in the figures" value={firstPeriod?.period_label} />
      {Object.keys(items).map((key) => (
        <FactRow key={key} label={humanize(key)} value={formatNumber(items[key])} />
      ))}
      {Object.keys(deltas).map((key) => (
        <FactRow
          key={key}
          label={humanize(key).replace(' pct', ' (year on year)')}
          value={deltas[key] != null ? `${deltas[key]}%` : null}
        />
      ))}
      <FactRow label="Currency" value={data.currency} />
      <FactRow label="Unit" value={data.denomination} />
      <FactRow label="Version" value={financials.version} />
    </div>
  );
}

/** The contents page belongs to one report, so each file gets its own. */
function ContentsPagesPerReport({ reports }: { reports: ExtractedReport[] }) {
  if (reports.length === 0) return <Empty />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {reports.map((report) => (
        <div key={report.document.id}>
          {reports.length > 1 && <FileCaption filename={report.document.filename} />}
          <ContentsPage detail={report.contents_page} />
        </div>
      ))}
    </div>
  );
}

function ContentsPage({ detail }: { detail: ReportOutlineDetail | null }) {
  if (!detail) return <Empty text="No contents page was stored for this report." />;
  return (
    <div>
      <FactRow label="Found" value={detail.found ? 'Yes' : 'No'} />
      <FactRow label="Read from" value={detail.source} />
      <FactRow label="Confidence" value={detail.confidence} />
      <FactRow label="Contents page number(s)" value={detail.pages?.join(', ')} />
      <FactRow label="Pages in the report" value={detail.page_count} />
      <FactRow label="Why it was not found" value={detail.reason} />
      <FactRow label="Checks that failed" value={detail.failed_checks?.join(', ')} />
      <FactRow label="Read on" value={formatDate(detail.extracted_at ?? null)} />
      {detail.entries && detail.entries.length > 0 && <ContentsEntries entries={detail.entries} />}
    </div>
  );
}

/** The contents page lines, indented by level and folded when long. */
function ContentsEntries({ entries }: { entries: ReportOutlineEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, OUTLINE_FOLD_AT);
  return (
    <div style={{ marginTop: 10 }}>
      {visible.map((entry, index) => (
        <div
          key={index}
          dir="auto"
          style={{
            ...bodyStyle,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            paddingInlineStart: ((entry.level ?? 1) - 1) * 18,
            fontWeight: entry.level === 1 ? 700 : 400,
          }}
        >
          <span>{entry.title_verbatim || entry.title}</span>
          <span style={{ color: '#9BA3C4' }}>{entry.page ?? ''}</span>
        </div>
      ))}
      {entries.length > OUTLINE_FOLD_AT && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, color: '#4040C8', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
        >
          {showAll ? 'Show less' : `Show all ${entries.length}`}
        </button>
      )}
    </div>
  );
}

function FlatOutline({ outline }: { outline: string[] }) {
  if (outline.length === 0) return <Empty />;
  return (
    <ol style={{ ...bodyStyle, margin: 0, paddingInlineStart: 20 }}>
      {outline.map((title, index) => (
        <li key={index} dir="auto">{title}</li>
      ))}
    </ol>
  );
}

function Sections({ sections }: { sections: ExtractedSection[] }) {
  if (sections.length === 0) return <Empty text="No sections were created from this report." />;
  return (
    <div>
      {sections.map((section) => (
        <FactRow
          key={section.section_code}
          label={section.title ?? section.section_code}
          value={
            section.mode
              ? `${section.mode}${section.mode_confirmed ? ' (confirmed)' : ' (not confirmed)'}`
              : 'No mode chosen'
          }
        />
      ))}
    </div>
  );
}

function Departments({ departments }: { departments: ExtractedDepartments | null }) {
  const raw = departments?.raw ?? [];
  if (raw.length === 0) return <Empty text="No departments were suggested from this report." />;
  const mapped = departments?.mapped ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {departments?.dismissed && (
        <div style={{ ...bodyStyle, color: '#9BA3C4' }}>These suggestions were dismissed.</div>
      )}
      {raw.map((department) => (
        <DepartmentCard
          key={department.name}
          department={department}
          matched={mapped.find((item) => item.name === department.name) ?? null}
        />
      ))}
    </div>
  );
}

function DepartmentCard({
  department,
  matched,
}: {
  department: NonNullable<ExtractedDepartments['raw']>[number];
  matched: NonNullable<ExtractedDepartments['mapped']>[number] | null;
}) {
  const matchText = !matched
    ? 'Not matched yet'
    : matched.department_id
      ? 'Matches an existing department'
      : 'No matching department';
  return (
    <div style={{ border: '1px solid #ECEEF8', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span dir="auto" style={{ fontSize: 12.5, fontWeight: 800, color: '#1A1D2E' }}>
          {department.rank != null ? `${department.rank}. ` : ''}
          {department.name}
        </span>
        <span style={{ ...pillStyle, background: '#F1F2F8', color: '#5A6080' }}>{matchText}</span>
      </div>
      {department.reason && <p dir="auto" style={{ ...bodyStyle, marginTop: 4 }}>{department.reason}</p>}
      {department.evidence && (
        <p dir="auto" style={{ ...bodyStyle, marginTop: 4, color: '#5A6080', fontStyle: 'italic' }}>
          “{department.evidence}”
        </p>
      )}
    </div>
  );
}

function FileCaption({ filename }: { filename: string }) {
  return (
    <div dir="auto" style={{ fontSize: 11.5, fontWeight: 700, color: '#5A6080', marginBottom: 4 }}>
      {filename}
    </div>
  );
}

/** "net_profit_change_pct" → "Net profit change pct". */
function humanize(key: string): string {
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatNumber(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.toLocaleString();
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
