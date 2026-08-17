// The Extraction step for a Custom-metrics report.
//
// The System version of this screen asks a question per figure: "we think this
// line is Revenue — is it?". Custom mode has no such question, because the user
// already answered it by choosing which file went into which section. What is left
// is tidying: a databook carries spacer rows and repeated subtotals, and a label
// that made sense inside its sheet can read badly in a report.
//
// Renaming is not cosmetic. The cross-quarter comparison matches custom rows by
// (section, label), so the label fixed here is what next quarter lines up against.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Undo2 } from 'lucide-react';
import { quarterlyReports, ApiError } from '@/lib/api';
import type {
  CustomExtractionRow,
  CustomFigureEdit,
  ExtractionReviewResponse,
} from '@/types/quarterly';

const ACCENT = '#4040C8';
const MUTED = '#6B7280';
const DARK = '#1F2340';

interface Props {
  companyId: string;
  reportId: string;
  data: ExtractionReviewResponse;
  onData: (next: ExtractionReviewResponse) => void;
}

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const detail = (err.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === 'string') return detail;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function CustomExtractionReview({ companyId, reportId, data, onData }: Props) {
  const navigate = useNavigate();
  // Edits are staged, not applied per keystroke: a rename is a DB write and the
  // comparison key, so it commits once on Save rather than 40 times while typing.
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sections = useMemo(() => data.sections ?? [], [data]);
  const total = sections.reduce((n, s) => n + s.rows.length, 0);

  const labelOf = (row: CustomExtractionRow) => labels[row.id] ?? row.label ?? '';

  const edits: CustomFigureEdit[] = useMemo(() => {
    const out: CustomFigureEdit[] = [];
    for (const s of sections) {
      for (const r of s.rows) {
        if (deleted.has(r.id)) {
          out.push({ id: r.id, deleted: true });
          continue;
        }
        const next = labels[r.id];
        if (next !== undefined && next.trim() && next.trim() !== (r.label ?? '')) {
          out.push({ id: r.id, label: next.trim() });
        }
      }
    }
    return out;
  }, [sections, labels, deleted]);

  const renameCount = edits.filter((e) => e.label !== undefined).length;
  const deleteCount = edits.filter((e) => e.deleted).length;
  const dirty = edits.length > 0;
  // An empty label can't be saved — the server rejects it, and "delete the row"
  // is what the user actually means. Block here so they aren't told at the end.
  const emptyLabel = Object.entries(labels).some(
    ([id, v]) => !deleted.has(id) && !v.trim(),
  );

  const goOutline = () => navigate(`/quarterly-report/${reportId}/outline`);

  const save = async (thenContinue: boolean) => {
    setSaving(true);
    setError(null);
    try {
      if (edits.length > 0) {
        onData(await quarterlyReports.editCustomFigures(companyId, reportId, edits));
        setLabels({});
        setDeleted(new Set());
      }
      if (thenContinue) goOutline();
    } catch (err) {
      setError(errorText(err, 'Could not save your changes.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: DARK, margin: 0 }}>
          Check what we read
        </h1>
        <p
          style={{
            fontSize: 12.5,
            color: MUTED,
            margin: '6px 0 18px',
            maxWidth: 660,
            lineHeight: 1.55,
          }}
        >
          {total} line{total === 1 ? '' : 's'} from your uploads, under the section you put each
          file in. Rename anything that reads badly, and delete the rows you don&rsquo;t want in
          the report — spacers, repeated totals. Everything left here is printed as-is.
        </p>

        {sections.length === 0 && (
          <div
            style={{
              padding: '18px 20px',
              background: '#FAFAFE',
              border: '1px solid #ECEEF8',
              borderRadius: 10,
              fontSize: 12.5,
              color: MUTED,
            }}
          >
            No figures yet. Go back to Financial Data and upload a statement for each section you
            want in the report.
          </div>
        )}

        {sections.map((section) => (
          <div key={section.section_code} style={{ marginBottom: 20 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{section.title}</span>
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
              <span style={{ fontSize: 11, color: MUTED }}>
                {section.rows.length} line{section.rows.length === 1 ? '' : 's'}
              </span>
            </div>

            <div style={{ border: '1px solid #ECEEF8', borderRadius: 10, overflow: 'hidden' }}>
              {section.rows.map((row, i) => {
                const isGone = deleted.has(row.id);
                return (
                  <div
                    key={row.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '7px 12px',
                      borderTop: i === 0 ? 'none' : '1px solid #F3F4FA',
                      background: isGone ? '#FCFCFD' : '#fff',
                      opacity: isGone ? 0.5 : 1,
                    }}
                  >
                    <input
                      className="inp"
                      value={labelOf(row)}
                      disabled={isGone || saving}
                      aria-label="Line label"
                      onChange={(e) =>
                        setLabels((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 12,
                        padding: '5px 9px',
                        textDecoration: isGone ? 'line-through' : undefined,
                      }}
                    />
                    {row.sheet && (
                      <span
                        style={{
                          fontSize: 10,
                          color: MUTED,
                          whiteSpace: 'nowrap',
                          maxWidth: 130,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={row.sheet}
                      >
                        {row.sheet}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 12,
                        fontVariantNumeric: 'tabular-nums',
                        color: DARK,
                        minWidth: 120,
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.value_display ?? '—'}
                    </span>
                    <button
                      type="button"
                      disabled={saving}
                      aria-label={isGone ? 'Keep this line' : 'Delete this line'}
                      onClick={() =>
                        setDeleted((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        })
                      }
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: saving ? 'wait' : 'pointer',
                        color: MUTED,
                        padding: 3,
                        display: 'flex',
                      }}
                    >
                      {isGone ? <Undo2 size={14} /> : <Trash2 size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

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
        <button
          className="btn bs"
          onClick={() => navigate(`/quarterly-report/${reportId}/financials`)}
        >
          Back to Financial Data
        </button>
        <div style={{ flex: 1, fontSize: 11.5, color: MUTED }}>
          {emptyLabel ? (
            <span style={{ color: '#B45309' }}>
              A line can&rsquo;t have an empty name — type one, or delete the row.
            </span>
          ) : dirty ? (
            [
              renameCount ? `${renameCount} renamed` : null,
              deleteCount ? `${deleteCount} to delete` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          ) : (
            `${total} line${total === 1 ? '' : 's'} ready`
          )}
          {error && <div style={{ color: '#C0392B', marginTop: 4 }}>{error}</div>}
        </div>
        {dirty && (
          <button
            className="btn bs"
            disabled={saving || emptyLabel}
            onClick={() => void save(false)}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
        <button
          className="btn bp"
          disabled={saving || emptyLabel}
          onClick={() => void save(true)}
        >
          {saving ? 'Saving…' : 'Continue to outline →'}
        </button>
      </div>
    </>
  );
}

export default CustomExtractionReview;
