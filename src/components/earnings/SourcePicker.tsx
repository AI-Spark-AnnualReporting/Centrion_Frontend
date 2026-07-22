import { useEffect, useState } from 'react';
import { earnings } from '@/lib/api';
import type { EarningsVariant, EarningsQuarter, SelectableSource, SourceUploadType } from '@/types/earnings';
import { sourcesPeriodKey, sourceKey, formatSourceType, needsTypeConfirmation } from '@/pages/earnings/helpers';
import { DocumentUploader } from './DocumentUploader';
import { INK, MUTED, FAINT, ACCENT, ACCENT_TINT, BORDER } from './tokens';

// Document types the backend recognises (_FILING_TYPES) — shown as GUIDANCE
// only now (the AI detects the type on upload); also reused as the correction
// dropdown's option list. 'aggregator' is a backend/system-only tag, never
// offered here.
const UPLOAD_TYPES: { value: SourceUploadType; label: string; desc: string }[] = [
  { value: 'annual', label: 'Annual report', desc: 'Full-year financial statements & MD&A' },
  { value: 'interim', label: 'Interim', desc: 'Quarterly or half-year statements' },
  { value: 'release', label: 'Press release', desc: 'Earnings press release' },
  { value: 'presentation', label: 'Presentation', desc: 'Investor / earnings deck' },
  { value: 'transcript', label: 'Transcript', desc: 'Earnings-call transcript' },
];

// Coverage → shared badge class + label (official-track rows only).
function coverageBadge(coverage: string): { cls: string; label: string } {
  if (coverage === 'full') return { cls: 'badge b-gn', label: 'Full' };
  if (coverage === 'partial') return { cls: 'badge b-am', label: 'Partial' };
  return { cls: 'badge b-gy', label: coverage || 'Unknown' };
}

// Extraction state → shared badge class + label (narrative/upload rows only).
// Never implies "ready" before the backend actually says so (D-12).
// 'completed' is the live backend's terminal value (confirmed against a real
// GET .../sources response) — 'ready' is kept as an alias for naming
// robustness, not because the backend has been observed to send it.
function extractionBadge(status: string | null): { cls: string; label: string } {
  if (status === 'ready' || status === 'completed') return { cls: 'badge b-gn', label: 'Ready' };
  if (status === 'failed') return { cls: 'badge b-rd', label: 'Failed' };
  return { cls: 'badge b-am', label: 'Extracting…' };
}

// Block 4 — source selection. One screen, no tabs: existing system reports and
// uploads are selected/staged in the same place, shown as two labelled groups
// (D-19 — an upload never implies an official figure source). Uploading
// itself is deferred to the page's Continue action (see EarningsSetupPage) —
// this component only stages files via the shared uploader.
export function SourcePicker({
  companyId,
  variant,
  fiscalYear,
  quarter,
  selectedIds,
  onSelectedIdsChange,
  uploadFiles,
  onUploadFilesChange,
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
  uploadFiles: File[];
  onUploadFilesChange: (files: File[]) => void;
}) {
  const [sources, setSources] = useState<SelectableSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const officialSources = sources.filter((s) => s.track !== 'narrative_adjusted');
  const narrativeSources = sources.filter((s) => s.track === 'narrative_adjusted');

  return (
    <div>
      {!periodReady ? (
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Guidance only — the AI detects the type on upload, this isn't a choice. */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: INK, marginBottom: 10 }}>Document types</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: 8,
              }}
            >
              {UPLOAD_TYPES.map((t) => (
                <div
                  key={t.value}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: ACCENT_TINT,
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: ACCENT, marginBottom: 3 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: FAINT, lineHeight: 1.4 }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Always both groups — never hidden, even when one side is empty —
              so official vs narrative is always visible (D-19). */}
          <SourceGroup
            title="From your system — official figures"
            subtitle="From filed reports"
            sources={officialSources}
            selectedIds={selectedIds}
            onToggle={toggle}
            emptyText="No official filings found for this period."
          />

          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Uploaded — narrative</span>
              <span style={{ fontSize: 11, color: FAINT }}>From your uploads</span>
            </div>
            {narrativeSources.length === 0 ? (
              <div style={{ fontSize: 12, color: FAINT, marginBottom: 10 }}>No uploads yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {narrativeSources.map((s) => {
                  const key = sourceKey(s);
                  return (
                    <SourceRow
                      key={key}
                      source={s}
                      checked={selectedIds.includes(key)}
                      onToggle={() => toggle(key)}
                    />
                  );
                })}
              </div>
            )}
            {/* Staging only — no upload call here. Continue does the actual
                upload + classify + extract as one action (see EarningsSetupPage). */}
            <DocumentUploader files={uploadFiles} onFilesChange={onUploadFilesChange} disabled={!periodReady} />
          </div>
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

// A narrative row's type — the AI's detected classification, shown as an
// editable dropdown so the user can correct it (D-19: never hide the type,
// it drives sourcing). Read-only fallback when the backend hasn't told us
// which report/draft owns this upload (no safe report id to PATCH against).
function TypeCorrector({ source: s }: { source: SelectableSource }) {
  const [current, setCurrent] = useState(s.type);
  const [pending, setPending] = useState(false);
  const editable = s.owning_report_id != null;
  const hint = needsTypeConfirmation({ type: current, detected_type: s.detected_type, type_confidence: s.type_confidence });

  if (!editable) {
    return <div style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>{formatSourceType(current)}</div>;
  }

  return (
    <div
      style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 8 }}
      onClick={(e) => e.stopPropagation()}
    >
      <select
        aria-label={`Type for ${s.label}`}
        value={current ?? ''}
        disabled={pending}
        onChange={async (e) => {
          const next = e.target.value as SourceUploadType;
          const prev = current;
          setCurrent(next); // optimistic
          setPending(true);
          try {
            const updated = await earnings.patchSourceType(
              s.owning_report_id as string,
              s.document_id as string,
              next,
            );
            setCurrent(updated.type);
          } catch {
            setCurrent(prev); // revert on failure
          } finally {
            setPending(false);
          }
        }}
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: INK,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: '2px 6px',
          background: '#fff',
        }}
      >
        {UPLOAD_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      {hint && (
        <span role="status" style={{ fontSize: 10.5, color: '#B4730B', fontWeight: 600 }}>
          Please confirm type
        </span>
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
          <TypeCorrector source={s} />
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
