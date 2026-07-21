import { useEffect, useState } from 'react';
import { earnings, ApiError } from '@/lib/api';
import type { EarningsVariant, EarningsQuarter, SelectableSource, SourceUploadType } from '@/types/earnings';
import { sourcesPeriodKey, sourceKey, formatSourceType } from '@/pages/earnings/helpers';
import { DocumentUploader } from './DocumentUploader';
import { INK, MUTED, FAINT, ACCENT, ACCENT_TINT, BORDER } from './tokens';

type Mode = 'existing' | 'upload';

// Guidance only — the kinds of documents that help build the report. Uploads are
// no longer tagged per-type in the UI; a single default tag is sent for all files.
const UPLOAD_TYPE_NOTES: { label: string; desc: string }[] = [
  { label: 'Annual report', desc: 'Full-year financial statements & MD&A' },
  { label: 'Interim', desc: 'Quarterly or half-year statements' },
  { label: 'Press release', desc: 'Earnings press release' },
  { label: 'Presentation', desc: 'Investor / earnings deck' },
  { label: 'Transcript', desc: 'Earnings-call transcript' },
];

// All uploads carry one tag now that the per-doc type picker is gone. 'annual' is
// the backend-recognised default for financial source documents.
const DEFAULT_UPLOAD_TYPE: SourceUploadType = 'annual';

// Coverage → shared badge class + label (official-track rows only).
function coverageBadge(coverage: string): { cls: string; label: string } {
  if (coverage === 'full') return { cls: 'badge b-gn', label: 'Full' };
  if (coverage === 'partial') return { cls: 'badge b-am', label: 'Partial' };
  return { cls: 'badge b-gy', label: coverage || 'Unknown' };
}

// Extraction state → shared badge class + label (narrative/upload rows only).
// Never implies "ready" before the backend actually says so (D-12).
function extractionBadge(status: string | null): { cls: string; label: string } {
  if (status === 'ready') return { cls: 'badge b-gn', label: 'Ready' };
  if (status === 'failed') return { cls: 'badge b-rd', label: 'Failed' };
  return { cls: 'badge b-am', label: 'Extracting…' };
}

// Block 4 — source selection. Two tracks, always shown as distinct groups:
// Official sources (DB reports, via GET /earnings/sources) and Narrative &
// adjusted (uploads — tagged with a type, shown honestly by extraction state
// until they're ready). "Upload new documents" reuses the shared uploader; the
// create endpoint consumes both source_report_ids and source_document_ids.
export function SourcePicker({
  companyId,
  variant,
  fiscalYear,
  quarter,
  selectedIds,
  onSelectedIdsChange,
}: {
  companyId: string | null;
  variant: EarningsVariant;
  fiscalYear: number | null;
  quarter: EarningsQuarter | null;
  selectedIds: string[];
  onSelectedIdsChange: (
    ids: string[],
    split: { source_report_ids: string[]; source_document_ids: string[] },
  ) => void;
}) {
  const [mode, setMode] = useState<Mode>('existing');
  const [sources, setSources] = useState<SelectableSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const periodReady = fiscalYear != null && (variant !== 'quarterly' || quarter != null);
  const periodKey = periodReady ? sourcesPeriodKey(variant, fiscalYear as number, quarter) : null;

  // Emits the flat selection plus its official/narrative split, computed here
  // since this is the one place that has both the ids and the loaded sources.
  const emit = (ids: string[]) => {
    const selected = sources.filter((s) => ids.includes(sourceKey(s)));
    onSelectedIdsChange(ids, {
      source_report_ids: selected.map((s) => s.report_id).filter((x): x is string => !!x),
      source_document_ids: selected.map((s) => s.document_id).filter((x): x is string => !!x),
    });
  };

  // Load the selectable sources whenever the (complete) period changes.
  useEffect(() => {
    if (!companyId || !periodKey) {
      setSources([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    earnings
      .getSelectableSources(companyId, periodKey)
      .then((res) => {
        if (cancelled) return;
        setSources(res.sources);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load sources.');
        setSources([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, periodKey, refreshKey]);

  // Drop any selected ids that are no longer in the list (period changed, etc.).
  useEffect(() => {
    const present = new Set(sources.map(sourceKey));
    const kept = selectedIds.filter((id) => present.has(id));
    if (kept.length !== selectedIds.length) emit(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  const toggle = (id: string) => {
    emit(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const handleUpload = () => {
    if (!companyId || !periodKey || uploadFiles.length === 0 || uploading) return;
    setUploading(true);
    setUploadNote(null);
    Promise.all(uploadFiles.map((f) => earnings.uploadEarningsSource(companyId, periodKey, f, DEFAULT_UPLOAD_TYPE)))
      .then((newSources) => {
        // Optimistic — the new sources appear immediately (in their reported
        // extraction state) instead of waiting on a refetch.
        setSources((prev) => [...prev, ...newSources]);
        setUploadFiles([]);
        setUploadNote('Uploaded — shown under "Narrative & adjusted" while it extracts.');
        setMode('existing');
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof ApiError && typeof err.body === 'object'
            ? 'Upload failed. Please try again.'
            : err instanceof Error
              ? err.message
              : 'Upload failed. Please try again.';
        setUploadNote(msg);
      })
      .finally(() => setUploading(false));
  };

  const officialSources = sources.filter((s) => s.track !== 'narrative_adjusted');
  const narrativeSources = sources.filter((s) => s.track === 'narrative_adjusted');

  return (
    <div>
      {/* Mode toggle */}
      <div className="tabs" style={{ marginBottom: 14 }}>
        {(['existing', 'upload'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`tab ${mode === m ? 'act' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'existing' ? 'Use existing reports' : 'Upload new documents'}
          </button>
        ))}
      </div>

      {mode === 'existing' ? (
        !periodReady ? (
          <EmptyHint>Select a reporting period above to load available sources.</EmptyHint>
        ) : loading ? (
          <EmptyHint>Loading sources…</EmptyHint>
        ) : loadError ? (
          <div
            role="alert"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
          >
            <span style={{ fontSize: 12, color: '#DC2626' }}>{loadError}</span>
            <button className="btn bs bsm" type="button" onClick={() => setRefreshKey((k) => k + 1)}>
              Retry
            </button>
          </div>
        ) : (
          // Always both groups — never hidden, even when one side is empty —
          // so the official/narrative distinction is always visible (D-19).
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SourceGroup
              title="Official sources"
              subtitle="From filed reports"
              sources={officialSources}
              selectedIds={selectedIds}
              onToggle={toggle}
              emptyText="No official filings found for this period."
            />
            <SourceGroup
              title="Narrative & adjusted"
              subtitle="From your uploads"
              sources={narrativeSources}
              selectedIds={selectedIds}
              onToggle={toggle}
              emptyText='No uploads yet — switch to "Upload new documents" to add one.'
            />
          </div>
        )
      ) : (
        <div>
          {/* Guidance note — the document types that help build the report.
              Uploads aren't tagged per-type anymore; add any of these together. */}
          <div
            style={{
              marginBottom: 12,
              padding: '12px 14px',
              borderRadius: 10,
              background: '#F7F8FC',
              border: `1px solid ${BORDER}`,
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED, marginBottom: 8 }}>
              Documents you can add — upload any of these together:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {UPLOAD_TYPE_NOTES.map((t) => (
                <div key={t.label} style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700, color: INK, minWidth: 108, flexShrink: 0 }}>{t.label}</span>
                  <span style={{ color: FAINT }}>{t.desc}</span>
                </div>
              ))}
            </div>
          </div>
          <DocumentUploader files={uploadFiles} onFilesChange={setUploadFiles} disabled={uploading} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              type="button"
              className="btn bp"
              disabled={uploadFiles.length === 0 || uploading}
              onClick={handleUpload}
              style={{ opacity: uploadFiles.length === 0 || uploading ? 0.55 : 1 }}
            >
              {uploading ? 'Uploading…' : 'Upload & extract'}
            </button>
          </div>
          {uploadNote && (
            <div
              role="status"
              style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(64,64,200,.06)',
                border: '1px solid rgba(64,64,200,.25)',
                color: MUTED,
                fontSize: 12,
              }}
            >
              {uploadNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One track's group: heading + rows, or an empty hint. Always rendered (even
// when its own `sources` is empty) so the two-group split stays visible.
function SourceGroup({
  title,
  subtitle,
  sources,
  selectedIds,
  onToggle,
  emptyText,
}: {
  title: string;
  subtitle: string;
  sources: SelectableSource[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyText: string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{title}</span>
        <span style={{ fontSize: 11, color: FAINT }}>{subtitle}</span>
      </div>
      {sources.length === 0 ? (
        <EmptyHint>{emptyText}</EmptyHint>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sources.map((s) => {
            const key = sourceKey(s);
            return (
              <SourceRow
                key={key}
                source={s}
                checked={selectedIds.includes(key)}
                onToggle={() => onToggle(key)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// One selectable row. Shared chrome (checkbox, label); trailing badge differs
// by track. A narrative source still extracting/failed can't be selected yet
// — never a usable source before it's actually ready (D-12).
function SourceRow({
  source: s,
  checked,
  onToggle,
}: {
  source: SelectableSource;
  checked: boolean;
  onToggle: () => void;
}) {
  const isNarrative = s.track === 'narrative_adjusted';
  const disabled = isNarrative && (s.extraction_status === 'extracting' || s.extraction_status === 'failed');
  const badge = isNarrative ? extractionBadge(s.extraction_status) : coverageBadge(s.coverage);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        padding: '11px 14px',
        borderRadius: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        background: checked ? ACCENT_TINT : '#fff',
        border: `1.5px solid ${checked ? ACCENT : BORDER}`,
        transition: 'border-color .12s, background .12s',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          flexShrink: 0,
          borderRadius: 5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: checked ? ACCENT : '#fff',
          border: checked ? 'none' : '1.5px solid #C9CDE4',
        }}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: INK,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {s.label}
        </div>
        {isNarrative ? (
          <div style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>{formatSourceType(s.type)}</div>
        ) : (
          s.period && <div style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>{s.period}</div>
        )}
      </div>
      <span className={badge.cls}>{badge.label}</span>
    </button>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '14px',
        background: '#F2F3FA',
        borderRadius: 10,
        fontSize: 12,
        color: FAINT,
      }}
    >
      {children}
    </div>
  );
}
