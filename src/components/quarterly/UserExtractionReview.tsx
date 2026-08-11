import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react';
import type {
  CustomExtractionSection,
  ExtractionReviewResponse,
  UserExtractionTable,
} from '@/types/quarterly';

/**
 * User-metrics extraction — read-only.
 *
 * The other two lanes ask a question here: System asks whether a mapping is right,
 * Custom asks you to tidy a label. This lane has nothing to ask, because nothing was
 * decided on your behalf — the sections ARE the tables in your files. What it has to
 * do instead is SHOW, and in particular show the tables that produced nothing: in this
 * lane a table that was skipped is a section that does not exist, and until this screen
 * the only symptom was an outline reading "Awaiting financial data" with no cause.
 *
 * So it is built around two lists — what we read, and what we could not — and every
 * table carries how we read it: which row was the header, which column the figures came
 * from, and how we knew that column was your quarter.
 */

const ACCENT = '#4040C8';
const MUTED = '#6B7280';
const DARK = '#1F2340';
const AMBER = '#B45309';
const LINE = '#ECEEF8';
const ROWS_COLLAPSED = 8;

interface Props {
  reportId: string;
  data: ExtractionReviewResponse;
}

/** "01_Aramco_Q3_2023_Income_Statement.xlsx" — the tail is what identifies it. */
function shortFile(name: string): string {
  const base = name.split('/').pop() || name;
  return base.length > 42 ? `${base.slice(0, 20)}…${base.slice(-20)}` : base;
}

function periodNote(t: UserExtractionTable, period?: string | null): string {
  if (t.period_source === 'column') return `column names ${period ?? 'the quarter'}`;
  if (t.period_source === 'declared') return 'period from the heading above the table';
  return `nothing named a period — assumed ${period ?? 'the report quarter'}`;
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <span style={{ color: tone || MUTED, fontSize: 12 }}>
      <strong style={{ color: tone || DARK, fontWeight: 700 }}>{n}</strong> {label}
    </span>
  );
}

/** How one table was read — the line a developer actually needs. */
function HowWeRead({ t, period }: { t: UserExtractionTable; period?: string | null }) {
  const assumed = t.period_source === 'assumed';
  return (
    <div style={{ fontSize: 11, color: assumed ? AMBER : MUTED, lineHeight: 1.6 }}>
      <FileSpreadsheet size={11} style={{ verticalAlign: -1, marginRight: 5 }} />
      <span title={t.file}>{shortFile(t.file)}</span>
      <span style={{ color: '#B9BED4' }}> › </span>
      <span style={{ fontWeight: 600, color: assumed ? AMBER : DARK }}>{t.table}</span>
      {t.status === 'extracted' && (
        <>
          <span style={{ color: '#B9BED4' }}> · </span>
          {t.rows} lines · header row {t.header_row} · values from column {t.value_col}
          {t.value_col_header ? ` “${t.value_col_header}”` : ''} · {periodNote(t, period)}
        </>
      )}
    </div>
  );
}

export default function UserExtractionReview({ reportId, data }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const sections: CustomExtractionSection[] = data.sections || [];
  const tables: UserExtractionTable[] = data.tables || [];
  const s = data.summary as ExtractionReviewResponse['summary'] & Record<string, number>;

  // Tables that yielded rows, keyed by the section they landed in — one section can
  // hold several, which is the grouping call's only visible effect.
  const tablesBySection = useMemo(() => {
    const out: Record<string, UserExtractionTable[]> = {};
    for (const t of tables) {
      if (t.status === 'extracted' && t.section_code) {
        (out[t.section_code] ||= []).push(t);
      }
    }
    return out;
  }, [tables]);

  const skipped = useMemo(() => tables.filter((t) => t.status === 'skipped'), [tables]);

  const isOpen = (code: string) => open[code] !== false; // sections start expanded
  const nothingRead = sections.length === 0;

  return (
    <div style={{ padding: '22px 28px', overflowY: 'auto', flex: 1 }}>
      <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: DARK }}>
        What we read from your files
      </h2>
      <p style={{ margin: '6px 0 0', fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
        Each table in your files becomes a section of the report, named after that table.
        Nothing here needs answering — it is what was read, so you can check it before the
        report is built.
      </p>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '14px 0 18px' }}>
        <Stat n={s?.file_count ?? 0} label="files" />
        <span style={{ color: '#D8DBEA' }}>·</span>
        <Stat n={s?.table_count ?? 0} label="tables found" />
        <span style={{ color: '#D8DBEA' }}>·</span>
        <Stat n={s?.section_count ?? 0} label="sections" tone={ACCENT} />
        <span style={{ color: '#D8DBEA' }}>·</span>
        <Stat n={s?.confirmed_count ?? 0} label="figures" />
        {(s?.skipped_count ?? 0) > 0 && (
          <>
            <span style={{ color: '#D8DBEA' }}>·</span>
            <Stat n={s.skipped_count} label="tables not used" tone={AMBER} />
          </>
        )}
        {data.period && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: MUTED }}>
            looking for <strong style={{ color: DARK }}>{data.period}</strong>
          </span>
        )}
      </div>

      {nothingRead && (
        <div
          className="card"
          style={{ padding: 18, borderColor: '#F3D9A4', background: '#FFFBF2', marginBottom: 18 }}
        >
          <div style={{ display: 'flex', gap: 9, color: AMBER, fontSize: 13, fontWeight: 600 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            Nothing was read from your files, so the report has no financial sections.
          </div>
          <div style={{ marginTop: 7, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
            Every table is listed below with the reason it was not used. The usual cause is
            the period: the files have to contain the quarter this report is for.
          </div>
        </div>
      )}

      {sections.map((sec) => {
        const srcTables = tablesBySection[sec.section_code] || [];
        const showAll = expanded[sec.section_code];
        const rows = showAll ? sec.rows : sec.rows.slice(0, ROWS_COLLAPSED);
        const opened = isOpen(sec.section_code);
        const units = srcTables[0];
        return (
          <div key={sec.section_code} className="card" style={{ marginBottom: 12, padding: 0 }}>
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [sec.section_code]: !opened }))}
              aria-expanded={opened}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {opened ? <ChevronDown size={15} color={MUTED} /> : <ChevronRight size={15} color={MUTED} />}
              <span style={{ fontSize: 14, fontWeight: 700, color: DARK }}>{sec.title}</span>
              {srcTables.length > 1 && (
                <span className="badge" style={{ background: '#EEF0FC', color: ACCENT, border: 'none' }}>
                  {srcTables.length} tables merged
                </span>
              )}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
                {units?.currency && (
                  <span style={{ fontSize: 11, color: MUTED }}>
                    {units.currency} · {units.scale}
                  </span>
                )}
                <span style={{ fontSize: 12, color: MUTED }}>{sec.rows.length} lines</span>
              </span>
            </button>

            {opened && (
              <div style={{ padding: '0 16px 14px' }}>
                <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${LINE}` }}>
                  {srcTables.map((t) => (
                    <HowWeRead key={`${t.file}:${t.table}`} t={t} period={data.period} />
                  ))}
                </div>

                {rows.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '6px 0', borderBottom: '1px solid #F6F7FC', fontSize: 12.5,
                    }}
                  >
                    <span style={{ flex: 1, color: DARK, minWidth: 0, overflow: 'hidden',
                                   textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={r.label ?? undefined}>
                      {r.label}
                    </span>
                    {srcTables.length > 1 && r.sheet && (
                      <span style={{ fontSize: 10.5, color: MUTED, maxWidth: 150, overflow: 'hidden',
                                     textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={r.sheet}>
                        {r.sheet}
                      </span>
                    )}
                    <span style={{ minWidth: 130, textAlign: 'right', color: DARK,
                                   fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {r.value_display}
                    </span>
                  </div>
                ))}

                {sec.rows.length > ROWS_COLLAPSED && (
                  <button
                    type="button"
                    className="btn bs"
                    style={{ marginTop: 10, padding: '5px 12px', fontSize: 11.5 }}
                    onClick={() => setExpanded((e) => ({ ...e, [sec.section_code]: !showAll }))}
                  >
                    {showAll ? 'Show fewer' : `Show all ${sec.rows.length} lines`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {skipped.length > 0 && (
        <div className="card" style={{ marginTop: 18, padding: 16, borderColor: '#F3D9A4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={15} color={AMBER} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: DARK }}>
              Not used ({skipped.length})
            </span>
            <span style={{ fontSize: 11.5, color: MUTED }}>
              — each of these would have been a section
            </span>
          </div>
          {skipped.map((t) => (
            <div
              key={`${t.file}:${t.table}`}
              style={{ padding: '8px 0', borderTop: `1px solid ${LINE}` }}
            >
              <HowWeRead t={t} period={data.period} />
              <div style={{ fontSize: 12, color: AMBER, marginTop: 3, paddingLeft: 16 }}>
                {t.reason}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginTop: 22, paddingTop: 16, borderTop: `1px solid ${LINE}`,
        }}
      >
        <button type="button" className="btn bs" onClick={() => navigate('/reports/quarterly')}>
          ← Back
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: MUTED }}>
          {nothingRead
            ? 'You can continue, but the report will have no financial sections.'
            : `${s?.section_count ?? sections.length} sections will be offered on the outline.`}
        </span>
        <button
          type="button"
          className="btn bp"
          style={{ padding: '11px 24px', fontSize: 13 }}
          onClick={() => navigate(`/quarterly-report/${reportId}/outline`)}
        >
          Continue to outline →
        </button>
      </div>
    </div>
  );
}
