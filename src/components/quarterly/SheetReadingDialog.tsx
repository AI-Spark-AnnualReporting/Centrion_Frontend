// "Is this how we should read your file?"
//
// Shown only when the upload could go in wrong: the column we'd use for line names
// looks like numbers, the file holds several tables, or there is more than one
// column of figures and none of them names the period. A clean two-column export
// never sees this.
//
// Nothing has been stored when this opens. Cancel leaves the section exactly as it
// was; Use this re-sends the same file with the choices below attached.

import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  FINANCIAL_SCALES,
  REPORTING_CURRENCIES,
  isKnownCurrency,
  type FinancialScale,
} from '@/constants/currency';
import type { FinancialsConfirmation, SheetStructureChoice } from '@/types/quarterly';

const ACCENT = '#4040C8';
const MUTED = '#6B7280';
const DARK = '#1F2340';

const TOKEN_TO_UI: Record<string, FinancialScale> = {
  actual: 'actual',
  thousand: 'thousands',
  thousands: 'thousands',
  million: 'millions',
  millions: 'millions',
  billion: 'billions',
  billions: 'billions',
};

interface Props {
  data: FinancialsConfirmation;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (choice: SheetStructureChoice, units: { currency: string; scale: string }) => void;
}

export function SheetReadingDialog({ data, busy, onCancel, onConfirm }: Props) {
  const [tableKey, setTableKey] = useState(data.tables[0]?.key ?? '');
  const table = useMemo(
    () => data.tables.find((t) => t.key === tableKey) ?? data.tables[0],
    [data.tables, tableKey],
  );

  // Our reading of the chosen table is the starting point; changing table resets
  // to that table's own guess rather than carrying the last one's columns over.
  const [headerRow, setHeaderRow] = useState<number | null>(null);
  const [labelCol, setLabelCol] = useState<number | null>(null);
  const [valueCol, setValueCol] = useState<number | null>(null);
  const [currency, setCurrency] = useState(data.currency);
  const [scale, setScale] = useState<FinancialScale>(
    TOKEN_TO_UI[(data.scale ?? '').toLowerCase()] ?? 'millions',
  );

  const header = headerRow ?? table?.header_row ?? 0;
  const label = labelCol ?? table?.label_col ?? 0;
  const value = valueCol ?? table?.value_col ?? 0;

  const pickTable = (key: string) => {
    setTableKey(key);
    setHeaderRow(null);
    setLabelCol(null);
    setValueCol(null);
  };

  // The preview comes from the server's reading. Once the user changes a column we
  // can't recompute it here (we don't have the cells), so it is labelled as our
  // reading and hidden the moment they diverge from it — showing rows that no
  // longer match the selected columns would be worse than showing none.
  const previewIsCurrent =
    table != null &&
    header === table.header_row &&
    label === table.label_col &&
    value === table.value_col;

  const colName = (i: number) =>
    table?.columns.find((c) => c.index === i)?.name ?? `Column ${i + 1}`;

  if (!table) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm how we should read this file"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,22,40,.45)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 60,
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          width: 'min(720px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(20,22,40,.28)',
        }}
      >
        <div style={{ padding: '18px 22px 0' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: DARK }}>
            Is this how we should read {data.filename}?
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
            for {data.section_title} — nothing has been saved yet
          </div>

          <div
            style={{
              display: 'flex',
              gap: 9,
              alignItems: 'flex-start',
              margin: '14px 0 0',
              padding: '10px 12px',
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 9,
            }}
          >
            <AlertTriangle size={15} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: '#92400E' }}>
              {data.reasons.map((r) => (
                <li key={r} style={{ marginBottom: 2 }}>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div style={{ padding: '16px 22px 0' }}>
          {data.tables.length > 1 && (
            <div style={{ marginBottom: 14 }}>
              <label className="fl-label" style={{ fontSize: 10 }}>
                Which table
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                {data.tables.map((t, i) => {
                  const on = t.key === tableKey;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => pickTable(t.key)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 999,
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: `1px solid ${on ? ACCENT : '#E4E6F1'}`,
                        background: on ? '#EEEEFF' : '#fff',
                        color: on ? ACCENT : '#5A6080',
                      }}
                    >
                      Table {i + 1} · {t.row_count} lines
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10.5, color: MUTED, marginTop: 5 }}>
                From sheet &ldquo;{table.sheet}&rdquo;
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 150px' }}>
              <label className="fl-label" style={{ fontSize: 10 }} htmlFor="sheet-header-row">
                Header row
              </label>
              <select
                className="inp sel"
                value={header}
                id="sheet-header-row"
                onChange={(e) => setHeaderRow(Number(e.target.value))}
                style={{ fontSize: 11.5 }}
              >
                {table.header_options.map((r) => (
                  <option key={r} value={r}>
                    Row {r + 1}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 190px' }}>
              <label className="fl-label" style={{ fontSize: 10 }} htmlFor="sheet-label-col">
                Line names
              </label>
              <select
                className="inp sel"
                value={label}
                id="sheet-label-col"
                onChange={(e) => setLabelCol(Number(e.target.value))}
                style={{ fontSize: 11.5 }}
              >
                {table.columns.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 190px' }}>
              <label className="fl-label" style={{ fontSize: 10 }} htmlFor="sheet-value-col">
                Figures
              </label>
              <select
                className="inp sel"
                value={value}
                id="sheet-value-col"
                onChange={(e) => setValueCol(Number(e.target.value))}
                style={{ fontSize: 11.5 }}
              >
                {table.columns.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <div style={{ flex: '1 1 150px' }}>
              <label className="fl-label" style={{ fontSize: 10 }} htmlFor="sheet-currency">
                Currency
              </label>
              <select
                className="inp sel"
                value={currency}
                id="sheet-currency"
                onChange={(e) => setCurrency(e.target.value)}
                style={{ fontSize: 11.5 }}
              >
                {!isKnownCurrency(currency) && <option value={currency}>{currency}</option>}
                {REPORTING_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 170px' }}>
              <label className="fl-label" style={{ fontSize: 10 }} htmlFor="sheet-scale">
                Numbers are in
              </label>
              <select
                className="inp sel"
                value={scale}
                id="sheet-scale"
                onChange={(e) => setScale(e.target.value as FinancialScale)}
                style={{ fontSize: 11.5 }}
              >
                {FINANCIAL_SCALES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* What those choices produce. */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 5 }}>
              {previewIsCurrent
                ? `First lines we'd read — ${table.row_count} in total`
                : `Reading ${colName(label)} as the names and ${colName(value)} as the figures`}
            </div>
            <div
              style={{
                border: '1px solid #ECEEF8',
                borderRadius: 9,
                overflow: 'hidden',
                background: '#FCFCFE',
              }}
            >
              {previewIsCurrent ? (
                table.preview.map((p, i) => (
                  <div
                    key={`${p.label}-${i}`}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '6px 12px',
                      borderTop: i === 0 ? 'none' : '1px solid #F3F4FA',
                      fontSize: 11.5,
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        color: DARK,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.label}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: DARK }}>
                      {p.value.toLocaleString()}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '12px', fontSize: 11.5, color: MUTED }}>
                  We&rsquo;ll read the file this way when you continue.
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            padding: '16px 22px 18px',
          }}
        >
          <button className="btn bs" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn bp"
            disabled={busy}
            onClick={() =>
              onConfirm(
                {
                  table_key: table.key,
                  header_row: header,
                  label_col: label,
                  value_col: value,
                },
                { currency, scale },
              )
            }
          >
            {busy ? 'Reading…' : 'Use this'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SheetReadingDialog;
