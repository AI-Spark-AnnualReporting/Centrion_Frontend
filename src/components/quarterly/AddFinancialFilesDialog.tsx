/**
 * "Upload more files" on the Extraction screen.
 *
 * The report's figures used to be settled by the first screen. When a coworker sent
 * corrected numbers — or the wrong file went up — the only way out was starting the
 * report again. This takes more spreadsheets at any point in the flow.
 *
 * The two actions are not Cancel/Confirm, they are two different outcomes, and the
 * user picks one UP FRONT rather than after we have read the file:
 *   Replace   — every figure on the report goes, and it is rebuilt from this upload.
 *   Keep both — a table whose name matches an existing section becomes "… (1)".
 * Replace is styled as the dangerous one because it is, and the copy above the
 * buttons says what it deletes in plain words.
 *
 * Modal shell mirrors ApproveConfirmDialog — the one hand-rolled dialog in the
 * quarterly flow with an Escape handler and a busy-guarded backdrop, which is what a
 * long-running destructive action needs.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Upload, X } from 'lucide-react';

import { quarterlyReports, reports as reportsApi, ApiError } from '@/lib/api';
import { usePipelinePoll } from '@/hooks/use-pipeline-poll';
import { Spinner } from '@/components/shared/Spinner';
import {
  FINANCIAL_SCALES,
  REPORTING_CURRENCIES,
  DEFAULT_CURRENCY,
  isKnownCurrency,
  type FinancialScale,
} from '@/constants/currency';
import {
  ACCEPTED_FIN_ATTR,
  ACCEPTED_FIN_EXT,
  MAX_FIN_DOCUMENTS,
  fileKey,
  formatBytes,
  hasFinExtension,
  type FinTableInfo,
} from './financialUpload';
import type { PipelineHandle } from '@/types/report';

const DARK = '#1A1D2E';
const MUTED = '#6B7280';
const GREEN = '#2E9B57';
const DANGER = '#DC2626';

type Choice = 'replace' | 'keep_both';

export function AddFinancialFilesDialog({
  companyId,
  reportId,
  defaultCurrency,
  defaultScale,
  onClose,
  onDone,
}: {
  companyId: string;
  reportId: string;
  /** What the report already uses. These pickers describe the NEW FILE only. */
  defaultCurrency?: string | null;
  defaultScale?: string | null;
  onClose: () => void;
  /** Fired once the pipeline finishes; `outlineUnlocked` drives the screen's notice. */
  onDone: (result: { outlineUnlocked: boolean }) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [finTables, setFinTables] = useState<Record<string, FinTableInfo>>({});
  const [currency, setCurrency] = useState<string>(
    (defaultCurrency || DEFAULT_CURRENCY).toUpperCase(),
  );
  const [scale, setScale] = useState<FinancialScale | ''>(
    (defaultScale as FinancialScale) || '',
  );
  const [busy, setBusy] = useState<Choice | null>(null);
  const [handle, setHandle] = useState<PipelineHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  // A file removed mid-flight must not have its own preflight answer land later.
  const finTablesRef = useRef(finTables);
  finTablesRef.current = finTables;

  const running = handle !== null;
  const { state } = usePipelinePoll(handle?.runId ?? null, handle?.pollUrl ?? null, {
    // The dialog draws a spinner, not a timeline — asking for node rows would be a
    // second request every tick with nothing reading the answer.
    nodes: false,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, running, busy]);

  useEffect(() => {
    if (state.phase === 'completed') {
      onDone({ outlineUnlocked: handle?.outlineUnlocked ?? false });
    } else if (state.phase === 'failed') {
      setError(state.run?.error_message || 'We could not read those files. Please try again.');
      setHandle(null);
      setBusy(null);
    }
  }, [state.phase, state.run, handle, onDone]);

  // ── Preflight: can we read any figures out of this at all ──────────────────
  const runTablesCheck = useCallback(async (fresh: File[]) => {
    for (const f of fresh) {
      const id = fileKey(f);
      try {
        const res = await reportsApi.checkTables(f);
        if (!(id in finTablesRef.current)) return;   // removed while we asked
        setFinTables((prev) => ({
          ...prev,
          [id]: res.has_tables
            ? { status: 'ok', tableCount: res.table_count }
            : { status: 'none', message: res.message },
        }));
      } catch {
        if (!(id in finTablesRef.current)) return;
        // Fail open — a preflight outage must not block a real upload. The backend
        // runs the same gate and will 422 with the same sentence.
        setFinTables((prev) => ({ ...prev, [id]: { status: 'ok' } }));
      }
    }
  }, []);

  const accept = useCallback((incoming: File[]) => {
    setError(null);
    const bad = incoming.filter((f) => !hasFinExtension(f.name));
    if (bad.length) {
      setError(`Financial data must be one of: ${ACCEPTED_FIN_EXT.join(', ')}`);
    }
    const good = incoming.filter((f) => hasFinExtension(f.name));
    setFiles((prev) => {
      const have = new Set(prev.map(fileKey));
      const fresh = good.filter((f) => !have.has(fileKey(f)));
      const room = MAX_FIN_DOCUMENTS - prev.length;
      const added = fresh.slice(0, Math.max(0, room));
      if (added.length) {
        setFinTables((t) => {
          const next = { ...t };
          added.forEach((f) => { next[fileKey(f)] = { status: 'checking' }; });
          return next;
        });
        void runTablesCheck(added);
      }
      return [...prev, ...added];
    });
  }, [runTablesCheck]);

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const gone = prev[idx];
      if (gone) setFinTables((t) => {
        const next = { ...t };
        delete next[fileKey(gone)];
        return next;
      });
      return prev.filter((_, i) => i !== idx);
    });
  };

  const checking = files.some((f) => finTables[fileKey(f)]?.status === 'checking');
  const unreadable = files.filter((f) => finTables[fileKey(f)]?.status === 'none');
  const canSubmit = files.length > 0 && !checking && unreadable.length === 0 && !busy;

  const submit = async (choice: Choice) => {
    setBusy(choice);
    setError(null);
    try {
      const h = await quarterlyReports.addQuarterlyFinancialFiles(companyId, reportId, files, {
        currency,
        scale: scale || undefined,
        onConflict: choice,
      });
      setHandle(h);
    } catch (e) {
      // ApiError.message is already the backend's own sentence.
      setError(e instanceof ApiError || e instanceof Error
        ? e.message
        : 'We could not start that upload. Please try again.');
      setBusy(null);
    }
  };

  const label = 'Upload more financial files';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={running || busy ? undefined : onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1400,
        background: 'rgba(20,22,40,.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'fade-in .2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto',
          background: '#fff', borderRadius: 16,
          boxShadow: '0 24px 60px rgba(20,22,40,.28)',
        }}
      >
        {running ? (
          <div style={{ padding: '38px 26px', textAlign: 'center' }}>
            <Spinner pad={0} />
            <div style={{ marginTop: 16, fontSize: 15, fontWeight: 700, color: DARK }}>
              Reading your files…
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
              {files.map((f) => f.name).join(', ')}
            </p>
            {state.phase === 'timeout' && (
              <>
                <p style={{ margin: '14px 0 0', fontSize: 13, color: MUTED }}>
                  This is taking longer than usual. It's still working — you can close
                  this and come back.
                </p>
                <button type="button" className="btn bs" style={{ marginTop: 14 }}
                        onClick={onClose}>
                  Close
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div style={{ padding: '20px 22px 0' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>{label}</div>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
                Add updated or additional statements. Excel, CSV or Word — the same
                kind of file you started with.
              </p>
            </div>

            {/* Units. These describe the FILE, not the report. */}
            <div style={{ display: 'flex', gap: 12, padding: '16px 22px 0' }}>
              <div style={{ flex: 1 }}>
                <label className="fl-label" htmlFor="add-fin-currency">Currency</label>
                <select
                  id="add-fin-currency" className="inp sel" value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {!isKnownCurrency(currency) && <option value={currency}>{currency}</option>}
                  {REPORTING_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="fl-label" htmlFor="add-fin-scale">Figures are in</label>
                <select
                  id="add-fin-scale" className="inp sel" value={scale}
                  onChange={(e) => setScale(e.target.value as FinancialScale | '')}
                >
                  <option value="">Select…</option>
                  {FINANCIAL_SCALES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Upload */}
            <div style={{ padding: '14px 22px 0' }}>
              <input
                ref={inputRef} type="file" multiple accept={ACCEPTED_FIN_ATTR}
                style={{ display: 'none' }}
                onChange={(e) => {
                  accept(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
              <div
                className="upload-z" role="button" tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); }
                }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  accept(Array.from(e.dataTransfer.files ?? []));
                }}
                style={dragging ? { borderColor: GREEN, background: 'rgba(46,155,87,.06)' } : undefined}
              >
                <Upload size={18} style={{ color: GREEN }} />
                <span style={{ fontSize: 13, color: MUTED }}>
                  Drop files here, or click to choose ({ACCEPTED_FIN_EXT.join(', ')})
                </span>
              </div>

              {files.length > 0 && (
                <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                  {files.map((f, i) => {
                    const info = finTables[fileKey(f)];
                    return (
                      <div key={fileKey(f)} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 600, color: DARK,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{f.name}</div>
                          <div style={{
                            fontSize: 11.5,
                            color: info?.status === 'none' ? DANGER : MUTED,
                          }}>
                            {info?.status === 'checking' ? 'Checking for tables…'
                              : info?.status === 'none' ? (info.message || 'No tables found')
                              : info?.tableCount ? `${info.tableCount} tables found`
                              : formatBytes(f.size)}
                          </div>
                        </div>
                        <button
                          type="button" aria-label="Remove file" onClick={() => removeFile(i)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: MUTED, padding: 4, lineHeight: 0,
                          }}
                        ><X size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* What each button does. The user picks before we read the file, so this
                has to be unambiguous about what Replace deletes. */}
            <div style={{
              margin: '16px 22px 0', padding: '12px 14px',
              background: '#FFF8EC', border: '1px solid #F5E3C0', borderRadius: 10,
              display: 'flex', gap: 10,
            }}>
              <AlertTriangle size={16} style={{ color: '#B45309', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 12.5, color: '#7C4A03', lineHeight: 1.65 }}>
                <strong>Replace</strong> removes every figure currently on this report
                and rebuilds it from this upload alone.{' '}
                <strong>Keep both</strong> adds these tables alongside what's already
                here; a table whose name matches an existing section becomes a new
                section named "… (1)".
                <div style={{ marginTop: 6 }}>
                  The currency and scale above describe <strong>this file only</strong> —
                  they don't change the scale the report is printed in.
                </div>
              </div>
            </div>

            {error && (
              <div style={{
                margin: '12px 22px 0', padding: '10px 12px', fontSize: 12.5,
                background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 8, color: '#991B1B',
              }}>{error}</div>
            )}

            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 8,
              padding: '18px 22px 20px',
            }}>
              <button type="button" className="btn bs" onClick={onClose} disabled={!!busy}>
                Cancel
              </button>
              <button type="button" className="btn bs" disabled={!canSubmit}
                      onClick={() => submit('keep_both')}>
                {busy === 'keep_both' ? 'Uploading…' : 'Keep both'}
              </button>
              <button
                type="button" className="btn bp" disabled={!canSubmit}
                onClick={() => submit('replace')}
                style={{ background: DANGER, borderColor: DANGER }}
              >
                {busy === 'replace' ? 'Replacing…' : 'Replace everything'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
