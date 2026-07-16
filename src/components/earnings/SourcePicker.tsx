import { useEffect, useState } from 'react';
import { earnings, documents, ApiError } from '@/lib/api';
import type { EarningsVariant, EarningsQuarter, SelectableSource } from '@/types/earnings';
import { sourcesPeriodKey } from '@/pages/earnings/helpers';
import { DocumentUploader } from './DocumentUploader';
import { INK, MUTED, FAINT, ACCENT, ACCENT_TINT, BORDER } from './tokens';

type Mode = 'existing' | 'upload';

// Coverage → shared badge class + label.
function coverageBadge(coverage: string): { cls: string; label: string } {
  if (coverage === 'full') return { cls: 'badge b-gn', label: 'Full' };
  if (coverage === 'partial') return { cls: 'badge b-am', label: 'Partial' };
  return { cls: 'badge b-gy', label: coverage || 'Unknown' };
}

// Block 4 — source selection. Default mode "Use existing reports" (multiselect
// from GET /earnings/sources with Full/Partial badges). "Upload new" reuses the
// shared uploader; uploaded docs are processed async and then appear here for
// selection (the create endpoint consumes source_report_ids, not files).
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
  onSelectedIdsChange: (ids: string[]) => void;
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
    const present = new Set(sources.map((s) => s.report_id));
    const kept = selectedIds.filter((id) => present.has(id));
    if (kept.length !== selectedIds.length) onSelectedIdsChange(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  const toggle = (id: string) => {
    onSelectedIdsChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  };

  const handleUpload = () => {
    if (!companyId || uploadFiles.length === 0 || uploading) return;
    setUploading(true);
    setUploadNote(null);
    documents
      .upload(companyId, { files: uploadFiles })
      .then(() => {
        setUploadNote(
          'Uploading & extracting… once processed, these documents appear under “Use existing reports” for selection.',
        );
        setUploadFiles([]);
        setMode('existing');
        setRefreshKey((k) => k + 1); // re-fetch so freshly-ready docs show up
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
        ) : sources.length === 0 ? (
          <EmptyHint>
            No sources found for this period. Switch to “Upload new documents” to add some.
          </EmptyHint>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sources.map((s) => {
              const checked = selectedIds.includes(s.report_id);
              const badge = coverageBadge(s.coverage);
              return (
                <button
                  key={s.report_id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(s.report_id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    textAlign: 'left',
                    padding: '11px 14px',
                    borderRadius: 12,
                    cursor: 'pointer',
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
                    {s.period && <div style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>{s.period}</div>}
                  </div>
                  <span className={badge.cls}>{badge.label}</span>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div>
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
