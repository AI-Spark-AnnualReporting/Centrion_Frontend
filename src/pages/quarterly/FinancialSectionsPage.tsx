// Financial Data — Custom-metrics reports only, the step between Period and
// Extraction.
//
// The old Custom flow took one workbook and asked a model which section each line
// belonged to. That guess was the only step that could put a real number in the
// wrong table, and nobody ever saw it happen. Here the user uploads their balance
// sheet INTO the Balance Sheet section, so the section is settled by the act of
// uploading and there is nothing left to guess.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { quarterlyReports, ApiError } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import { QuarterlyReportStepper } from '@/components/quarterly/QuarterlyReportStepper';
import {
  FINANCIAL_SCALES,
  REPORTING_CURRENCIES,
  isKnownCurrency,
  type FinancialScale,
} from '@/constants/currency';
import { SheetReadingDialog } from '@/components/quarterly/SheetReadingDialog';
import {
  needsConfirmation,
  type FinancialSection,
  type FinancialSectionUpload,
  type FinancialsConfirmation,
  type FinancialsResponse,
  type SheetStructureChoice,
} from '@/types/quarterly';

const ACCENT = '#4040C8';
const GREEN = '#2E9B57';
const MUTED = '#6B7280';
const DARK = '#1F2340';

const ACCEPTED_EXT = ['.xlsx', '.csv', '.docx'] as const;
const ACCEPTED_ATTR = ACCEPTED_EXT.join(',');

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXT.some((ext) => lower.endsWith(ext));
}

// The backend stores the parser's singular token ('thousand'); the pickers speak
// the UI's plural ('thousands'). One place converts, so neither side has to know
// about the other's vocabulary.
const TOKEN_TO_UI: Record<string, FinancialScale> = {
  actual: 'actual',
  thousand: 'thousands',
  thousands: 'thousands',
  million: 'millions',
  millions: 'millions',
  billion: 'billions',
  billions: 'billions',
};

function scaleToUi(token: string | null | undefined): FinancialScale {
  return TOKEN_TO_UI[(token ?? '').toLowerCase()] ?? 'millions';
}

function scaleLabel(token: string | null | undefined): string {
  const ui = scaleToUi(token);
  return FINANCIAL_SCALES.find((s) => s.value === ui)?.label ?? ui;
}

// Where the scale came from. A guess has to look like a guess — it is the one
// value that silently multiplies every figure in a section by 1000 when wrong.
function scaleOrigin(source: string | null | undefined): { text: string; warn: boolean } {
  switch (source) {
    case 'user_section':
      return { text: 'you set this', warn: false };
    case 'units_llm':
    case 'units_text':
      return { text: 'from the file', warn: false };
    case 'prior':
    case 'prior_override':
      return { text: 'matched to last quarter', warn: false };
    case 'llm_fallback':
      return { text: 'read from the header', warn: false };
    case 'user':
      return { text: 'your report default', warn: false };
    default:
      return { text: 'assumed — check this', warn: true };
  }
}

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null;
    const detail = body?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
      const d = detail as { error?: string; sections?: string[]; hint?: string };
      if (d.error) {
        return d.sections?.length
          ? `${d.error} ${d.sections.join(', ')}.${d.hint ? ` ${d.hint}` : ''}`
          : d.error;
      }
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

function Shell({ reportId, children }: { reportId?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {reportId && (
        <QuarterlyReportStepper step="financials" reportId={reportId} metricsMode="custom" />
      )}
      {children}
    </div>
  );
}

// ── One section row ─────────────────────────────────────────────────────────

interface RowProps {
  section: FinancialSection;
  open: boolean;
  busy: boolean;
  error: string | null;
  onToggleOpen: () => void;
  onToggleIncluded: (included: boolean) => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
  onUnits: (units: { currency?: string; scale?: string }) => void;
}

function SectionRow({
  section,
  open,
  busy,
  error,
  onToggleOpen,
  onToggleIncluded,
  onUpload,
  onRemove,
  onUnits,
}: RowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const file: FinancialSectionUpload | null = section.file;

  const take = (picked: File | null | undefined) => {
    if (!picked) return;
    if (!hasAcceptedExtension(picked.name)) {
      setLocalError(`${picked.name} isn't a data file. Use ${ACCEPTED_EXT.join(', ')}.`);
      return;
    }
    setLocalError(null);
    onUpload(picked);
  };

  const origin = file ? scaleOrigin(file.scale_source) : null;

  return (
    <div
      style={{
        border: '1px solid #ECEEF8',
        borderRadius: 10,
        marginBottom: 8,
        background: section.included ? '#fff' : '#FCFCFD',
        opacity: section.included ? 1 : 0.62,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
        <input
          type="checkbox"
          checked={section.included}
          disabled={busy}
          onChange={(e) => onToggleIncluded(e.target.checked)}
          aria-label={`Include ${section.title}`}
          style={{ accentColor: ACCENT, width: 15, height: 15, cursor: busy ? 'wait' : 'pointer' }}
        />

        <button
          type="button"
          onClick={onToggleOpen}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {open ? (
            <ChevronDown size={14} color={MUTED} />
          ) : (
            <ChevronRight size={14} color={MUTED} />
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{section.title}</span>
          {section.is_custom && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '.03em',
                textTransform: 'uppercase',
                color: ACCENT,
                background: '#EEEEFF',
                border: '1px solid #DDDDF6',
                borderRadius: 999,
                padding: '1px 7px',
              }}
            >
              Yours
            </span>
          )}
        </button>

        <div style={{ fontSize: 11.5, color: file ? GREEN : MUTED, whiteSpace: 'nowrap' }}>
          {busy
            ? 'Reading…'
            : file
              ? `${file.row_count} line${file.row_count === 1 ? '' : 's'} · ${file.currency} · ${scaleLabel(file.scale)}`
              : section.included
                ? 'No file yet'
                : 'Not included'}
        </div>
      </div>

      {open && (
        <div style={{ padding: '0 14px 14px 39px' }}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_ATTR}
            onChange={(e) => {
              take(e.target.files?.[0]);
              e.target.value = '';
            }}
            style={{ display: 'none' }}
          />

          {file ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                border: '1px solid #E4F0E9',
                background: '#F6FBF8',
                borderRadius: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: DARK,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file.filename}
                </div>
                <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>
                  {file.row_count} line{file.row_count === 1 ? '' : 's'} read · scale{' '}
                  <span style={{ color: origin?.warn ? '#B45309' : MUTED }}>{origin?.text}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn bs"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                style={{ fontSize: 11 }}
              >
                Replace
              </button>
              <button
                type="button"
                aria-label={`Remove the file for ${section.title}`}
                disabled={busy}
                onClick={onRemove}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: busy ? 'wait' : 'pointer',
                  color: MUTED,
                  padding: 4,
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragging) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                take(e.dataTransfer.files?.[0]);
              }}
              className="upload-z"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '13px 16px',
                cursor: 'pointer',
                borderColor: dragging ? GREEN : undefined,
                background: dragging ? 'rgba(46,155,87,.06)' : undefined,
              }}
            >
              <Upload size={16} color={GREEN} />
              <span style={{ fontSize: 11.5, color: '#5A6080' }}>
                Upload your {section.title.toLowerCase()} — Excel, CSV or Word
              </span>
            </div>
          )}

          {/* Per-section units. Shown only once there is something to reinterpret:
              this changes how the stored numbers are READ, it never re-reads the
              file, so it is meaningless before an upload. */}
          {file && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, maxWidth: 150 }}>
                <label className="fl-label" style={{ fontSize: 9.5 }}>
                  Currency
                </label>
                <select
                  className="inp sel"
                  value={file.currency}
                  disabled={busy}
                  onChange={(e) => onUnits({ currency: e.target.value })}
                  style={{ fontSize: 11.5 }}
                >
                  {!isKnownCurrency(file.currency) && (
                    <option value={file.currency}>{file.currency}</option>
                  )}
                  {REPORTING_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, maxWidth: 170 }}>
                <label className="fl-label" style={{ fontSize: 9.5 }}>
                  Numbers are in
                </label>
                <select
                  className="inp sel"
                  value={scaleToUi(file.scale)}
                  disabled={busy}
                  onChange={(e) => onUnits({ scale: e.target.value })}
                  style={{ fontSize: 11.5 }}
                >
                  {FINANCIAL_SCALES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              {origin?.warn && (
                <div style={{ fontSize: 10.5, color: '#B45309', paddingBottom: 8 }}>
                  We couldn&rsquo;t tell from the file — confirm the scale.
                </div>
              )}
            </div>
          )}

          {(error || localError) && (
            <div style={{ fontSize: 11, color: '#C0392B', marginTop: 8 }}>
              {error ?? localError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function FinancialSectionsPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [data, setData] = useState<FinancialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  // An upload the server wouldn't guess at. We hold the File alongside it because
  // confirming re-sends the same bytes with the user's answer — nothing is parked
  // server-side, so there is no temp copy to expire or clean up.
  const [pending, setPending] = useState<
    { data: FinancialsConfirmation; file: File } | null
  >(null);

  useEffect(() => {
    if (!companyId || !reportId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    quarterlyReports
      .getFinancials(companyId, reportId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, 'Failed to load the financial sections.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reportId, retryKey]);

  // Every mutation returns the whole screen, so there is one place that knows what
  // the state is and no chance of the row list and the Continue gate disagreeing.
  const run = useCallback(
    async (code: string, action: () => Promise<FinancialsResponse>) => {
      setBusyCode(code);
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
      setContinueError(null);
      try {
        setData(await action());
      } catch (err) {
        setRowErrors((prev) => ({
          ...prev,
          [code]: errorText(err, 'That didn’t work. Try again.'),
        }));
      } finally {
        setBusyCode(null);
      }
    },
    [],
  );

  // Upload has two possible outcomes, so it can't go through `run` (which assumes
  // the screen payload comes back): either it stored the figures, or it stored
  // nothing and is asking how to read the file.
  const doUpload = useCallback(
    async (
      code: string,
      file: File,
      units?: { currency?: string; scale?: string },
      structure?: SheetStructureChoice,
    ) => {
      if (!companyId || !reportId) return;
      setBusyCode(code);
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
      setContinueError(null);
      try {
        const res = await quarterlyReports.uploadFinancialsSection(
          companyId,
          reportId,
          code,
          file,
          units,
          structure,
        );
        if (needsConfirmation(res)) {
          setPending({ data: res, file });
        } else {
          setPending(null);
          setData(res);
        }
      } catch (err) {
        setPending(null);
        setRowErrors((prev) => ({
          ...prev,
          [code]: errorText(err, 'That didn’t work. Try again.'),
        }));
      } finally {
        setBusyCode(null);
      }
    },
    [companyId, reportId],
  );

  const grouped = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, FinancialSection[]>();
    for (const s of data?.sections ?? []) {
      if (!byGroup.has(s.section_group)) {
        byGroup.set(s.section_group, []);
        order.push(s.section_group);
      }
      byGroup.get(s.section_group)!.push(s);
    }
    return order.map((g) => ({ group: g, sections: byGroup.get(g)! }));
  }, [data]);

  const withFiles = (data?.sections ?? []).filter((s) => s.included && s.file).length;
  const includedCount = (data?.sections ?? []).filter((s) => s.included).length;

  const saveSettings = (body: { currency?: string; scale?: string }) => {
    if (!companyId || !reportId) return;
    void run('__settings__', () =>
      quarterlyReports.saveFinancialsSettings(companyId, reportId, body),
    );
  };

  const addSection = async () => {
    if (!companyId || !reportId) return;
    const title = newTitle.trim();
    if (!title) return;
    setAddError(null);
    setBusyCode('__add__');
    try {
      setData(await quarterlyReports.addFinancialsSection(companyId, reportId, title));
      setNewTitle('');
      setAdding(false);
    } catch (err) {
      setAddError(errorText(err, 'Could not add that section.'));
    } finally {
      setBusyCode(null);
    }
  };

  const onContinue = async () => {
    if (!companyId || !reportId) return;
    setContinuing(true);
    setContinueError(null);
    try {
      const res = await quarterlyReports.completeFinancials(companyId, reportId);
      navigate(res.next || `/quarterly-report/${reportId}/extraction`);
    } catch (err) {
      setContinueError(errorText(err, 'Could not continue.'));
      setContinuing(false);
    }
  };

  if (loading) {
    return (
      <Shell reportId={reportId}>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <Spinner />
        </div>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell reportId={reportId}>
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#C0392B', marginBottom: 14 }}>
            {error ?? 'No financial sections available.'}
          </div>
          <button className="btn bs" onClick={() => setRetryKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell reportId={reportId}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: DARK, margin: 0 }}>Financial Data</h1>
        <p style={{ fontSize: 12.5, color: MUTED, margin: '6px 0 0', maxWidth: 640, lineHeight: 1.55 }}>
          Pick the sections your report should have, and upload the statement for each one.
          Because you choose where each file goes, every figure lands exactly where you put it —
          nothing has to work out what a line means.
        </p>

        {/* Report-wide units. Every figure in the report is printed in this scale;
            a section whose file says otherwise keeps its own reading. */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-end',
            margin: '18px 0 20px',
            padding: '14px 16px',
            background: '#FAFAFE',
            border: '1px solid #ECEEF8',
            borderRadius: 10,
          }}
        >
          <div style={{ maxWidth: 170, flex: 1 }}>
            <label className="fl-label" style={{ fontSize: 10 }} htmlFor="fin-report-currency">
              Report currency
            </label>
            <select
              id="fin-report-currency"
              className="inp sel"
              value={data.currency}
              disabled={busyCode !== null}
              onChange={(e) => saveSettings({ currency: e.target.value })}
            >
              {!isKnownCurrency(data.currency) && (
                <option value={data.currency}>{data.currency}</option>
              )}
              {REPORTING_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ maxWidth: 190, flex: 1 }}>
            <label className="fl-label" style={{ fontSize: 10 }} htmlFor="fin-report-scale">
              Report figures in
            </label>
            <select
              id="fin-report-scale"
              className="inp sel"
              value={scaleToUi(data.scale)}
              disabled={busyCode !== null}
              onChange={(e) => saveSettings({ scale: e.target.value })}
            >
              {FINANCIAL_SCALES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 11, color: MUTED, paddingBottom: 9, lineHeight: 1.5 }}>
            Every table prints in this currency and scale. If a file states its own units we use
            those to read it, then convert.
          </div>
        </div>

        {grouped.map(({ group, sections }) => (
          <div key={group} style={{ marginBottom: 18 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: '#8A90A8',
                marginBottom: 8,
              }}
            >
              {group}
            </div>
            {sections.map((s) => (
              <SectionRow
                key={s.section_code}
                section={s}
                open={openCode === s.section_code}
                busy={busyCode === s.section_code}
                error={rowErrors[s.section_code] ?? null}
                onToggleOpen={() =>
                  setOpenCode((c) => (c === s.section_code ? null : s.section_code))
                }
                onToggleIncluded={(included) => {
                  if (!companyId || !reportId) return;
                  void run(s.section_code, () =>
                    quarterlyReports.patchFinancialsSection(companyId, reportId, s.section_code, {
                      included,
                    }),
                  );
                }}
                onUpload={(file) => {
                  setOpenCode(s.section_code);
                  void doUpload(s.section_code, file);
                }}
                onRemove={() => {
                  if (!companyId || !reportId) return;
                  void run(s.section_code, () =>
                    quarterlyReports.deleteFinancialsSectionUpload(
                      companyId,
                      reportId,
                      s.section_code,
                    ),
                  );
                }}
                onUnits={(units) => {
                  if (!companyId || !reportId) return;
                  void run(s.section_code, () =>
                    quarterlyReports.patchFinancialsSection(
                      companyId,
                      reportId,
                      s.section_code,
                      units,
                    ),
                  );
                }}
              />
            ))}
          </div>
        ))}

        {/* Add your own. Saved against the company, so next quarter it is already
            here and only needs a file. */}
        <div style={{ marginTop: 4 }}>
          {adding ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, maxWidth: 380 }}>
                <input
                  className="inp"
                  autoFocus
                  value={newTitle}
                  maxLength={120}
                  placeholder="e.g. Production volumes by field"
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void addSection();
                    }
                    if (e.key === 'Escape') {
                      setAdding(false);
                      setAddError(null);
                    }
                  }}
                />
                {addError && (
                  <div style={{ fontSize: 11, color: '#C0392B', marginTop: 6 }}>{addError}</div>
                )}
                <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6 }}>
                  A table of your own figures. Saved for this company, so it comes back next
                  quarter.
                </div>
              </div>
              <button
                className="btn bp"
                disabled={!newTitle.trim() || busyCode === '__add__'}
                onClick={() => void addSection()}
              >
                {busyCode === '__add__' ? 'Adding…' : 'Add'}
              </button>
              <button
                className="btn bs"
                onClick={() => {
                  setAdding(false);
                  setAddError(null);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="btn bs"
              onClick={() => setAdding(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} />
              Add a section
            </button>
          )}
        </div>
      </div>

      {/* Footer — the gate. An included section with no file would print an empty
          table, and fixing it is one click from here versus a discovery at Preview. */}
      <div
        style={{
          borderTop: '1px solid #ECEEF8',
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: '#fff',
        }}
      >
        <button className="btn bs" onClick={() => navigate('/reports/quarterly')}>
          Back
        </button>
        <div style={{ flex: 1, fontSize: 11.5, color: MUTED }}>
          <span>
            {withFiles} of {includedCount} section{includedCount === 1 ? '' : 's'} ready
          </span>
          {data.blocking.length > 0 && (
            // Every section starts ticked, so on a fresh screen this is all 18 of
            // them. Naming three and counting the rest keeps the line readable
            // while still pointing at something specific to go and do.
            <span style={{ color: '#B45309' }}>
              {' · still need a file: '}
              {data.blocking.slice(0, 3).join(', ')}
              {data.blocking.length > 3 && ` +${data.blocking.length - 3} more`}
              {'. Upload one for each, or untick the ones you don’t have.'}
            </span>
          )}
          {continueError && (
            <div style={{ color: '#C0392B', marginTop: 4 }}>{continueError}</div>
          )}
        </div>
        <button
          className="btn bp"
          disabled={!data.can_continue || continuing || busyCode !== null}
          onClick={() => void onContinue()}
          title={data.can_continue ? undefined : 'Every ticked section needs a file first'}
        >
          {continuing ? 'Saving…' : 'Continue to extraction →'}
        </button>
      </div>

      {/* Only when the read wasn't obvious. Cancel writes nothing — the section is
          untouched, exactly as it was before the file was picked. */}
      {pending && (
        <SheetReadingDialog
          data={pending.data}
          busy={busyCode === pending.data.section_code}
          onCancel={() => setPending(null)}
          onConfirm={(choice, units) =>
            void doUpload(pending.data.section_code, pending.file, units, choice)
          }
        />
      )}
    </Shell>
  );
}
