import { useState, type CSSProperties, type ReactNode } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import type { AnnualReportExtraction as Extraction, LiveStep } from '@/types/company';
import {
  ContentsPage,
  Departments,
  PopupPart,
  Sections,
  SummaryDetails,
  SummaryPopup,
} from './AnnualReportExtraction';
import { LiveStepsTable } from './ExtractionLiveTable';
import {
  EXTRACTION_CATEGORIES,
  POPUP_TITLES,
  categoryCount,
  categoryState,
  categoryStateWords,
  chipSteps,
  stepsForCategory,
  type CategoryKey,
  type CategoryState,
  type ExtractionCategory,
  type SummaryKey,
} from './extractionLive';

// The 4 chips on the latest report's row in "Your Uploaded Reports": Contents,
// Departments, ESG and General info. Each is green (all extracted), amber (partly),
// red (nothing extracted), grey (nothing attempted) or a spinner, and opens a popup
// with what was found (or why not).

const CHIP_COLORS: Record<CategoryState, { background: string; border: string; text: string }> = {
  done: { background: '#ECF8F2', border: '#CDEEDD', text: '#0B7A53' },
  partial: { background: '#FDF3E2', border: '#F6DDB0', text: '#B45309' },
  failed: { background: '#FDECEC', border: '#F7CFCF', text: '#B4302A' },
  none: { background: '#F3F4F9', border: '#E2E4F0', text: '#5A6080' },
  running: { background: '#EEF0FF', border: '#D9DCFA', text: '#4040C8' },
};

const STATUS_TEXT: Record<CategoryState, string> = {
  done: 'Extracted',
  partial: 'Partly extracted',
  failed: 'Not extracted',
  none: 'Skipped',
  running: 'Working on it…',
};

const statusLineStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  padding: '10px 12px',
  borderRadius: 10,
  background: '#F8F9FE',
};

interface DocumentExtractionChipsProps {
  data: Extraction;
  documentId: string;
  filename: string;
  /** Which chips this file shows: all four for an annual report, ESG only for an ESG file. */
  categoryKeys: CategoryKey[];
}

/** The chips for one file, and the popup the clicked one opens. */
export default function DocumentExtractionChips({
  data,
  documentId,
  filename,
  categoryKeys,
}: DocumentExtractionChipsProps) {
  const [openKey, setOpenKey] = useState<CategoryKey | null>(null);
  const steps = chipSteps(data);
  const categories = EXTRACTION_CATEGORIES.filter((category) => categoryKeys.includes(category.key));
  const openCategory = categories.find((category) => category.key === openKey) ?? null;

  return (
    <>
      <div
        role="group"
        aria-label="What we extracted from this file"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
      >
        {categories.map((category) => (
          <CategoryChip
            key={category.key}
            category={category}
            steps={stepsForCategory(steps, category)}
            onOpen={() => setOpenKey(category.key)}
          />
        ))}
      </div>
      {openCategory && (
        <SummaryPopup title={openCategory.label} onClose={() => setOpenKey(null)}>
          <CategoryDetails
            category={openCategory}
            steps={stepsForCategory(steps, openCategory)}
            data={data}
            documentId={documentId}
            filename={filename}
          />
        </SummaryPopup>
      )}
    </>
  );
}

/** One pill button: icon, label, and "6/8" for General info. */
function CategoryChip({ category, steps, onOpen }: {
  category: ExtractionCategory;
  steps: LiveStep[];
  onOpen: () => void;
}) {
  const state = categoryState(steps);
  const colors = CHIP_COLORS[state];
  const count = categoryCount(steps);
  const countWords = count ? `, ${count.replace('/', ' of ')} done` : '';
  return (
    <button
      type="button"
      className="xchip"
      onClick={onOpen}
      aria-label={`${category.label}: ${categoryStateWords(state)}${countWords}. Show details`}
      aria-busy={state === 'running' || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 28,
        padding: '0 11px 0 8px',
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: colors.background,
        color: colors.text,
        fontSize: 11.5,
        fontWeight: 700,
        fontFamily: 'inherit',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <StateIcon state={state} size={15} />
      <span>{category.label}</span>
      {count && <span style={{ fontWeight: 600, opacity: 0.75 }}>{count}</span>}
    </button>
  );
}

/** Spinner, tick, cross or grey dash. */
function StateIcon({ state, size }: { state: CategoryState; size: number }): ReactNode {
  if (state === 'running') {
    return (
      <span
        className="proc-ring"
        aria-hidden="true"
        style={{ width: size - 3, height: size - 3, borderWidth: 2 }}
      />
    );
  }
  if (state === 'done') return <CheckCircle2 size={size} color="#0F9D6B" aria-hidden="true" />;
  if (state === 'partial') return <AlertCircle size={size} color="#D97706" aria-hidden="true" />;
  if (state === 'failed') return <XCircle size={size} color="#DC2626" aria-hidden="true" />;
  return <MinusCircle size={size} color="#9BA3C4" aria-hidden="true" />;
}

/** The popup body for one category. */
function CategoryDetails({ category, steps, data, documentId, filename }: {
  category: ExtractionCategory;
  steps: LiveStep[];
  data: Extraction;
  documentId: string;
  filename: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div dir="auto" style={{ fontSize: 11.5, fontWeight: 700, color: '#5A6080', marginTop: -8 }}>
        {filename}
      </div>
      {category.key === 'general' ? (
        <GeneralDetails steps={steps} data={data} />
      ) : (
        <>
          <StatusLine steps={steps} />
          <CategoryBody categoryKey={category.key} data={data} documentId={documentId} />
        </>
      )}
    </div>
  );
}

/** One line saying how the category's step ended, with its value or its reason. */
function StatusLine({ steps }: { steps: LiveStep[] }) {
  const state = categoryState(steps);
  const step = steps[0];
  const detail = step?.state === 'done' ? step.value : step?.message;
  return (
    <div style={statusLineStyle} role="status">
      <span style={{ display: 'flex', marginTop: 1 }}>
        <StateIcon state={state} size={18} />
      </span>
      <span>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: CHIP_COLORS[state].text }}>
          {STATUS_TEXT[state]}
        </span>
        {detail && (
          <span dir="auto" style={{ display: 'block', fontSize: 12, color: '#3A3F58', marginTop: 2 }}>
            {detail}
          </span>
        )}
      </span>
    </div>
  );
}

/** What was found for Contents, Departments or ESG. */
function CategoryBody({ categoryKey, data, documentId }: {
  categoryKey: CategoryKey;
  data: Extraction;
  documentId: string;
}) {
  if (categoryKey === 'contents') {
    const report = data.reports.find((item) => item.document.id === documentId) ?? null;
    return (
      <>
        <PopupPart title="Sections (what the Previous option shows)">
          <Sections sections={data.sections} />
        </PopupPart>
        <PopupPart title="Contents page read from this report">
          <ContentsPage detail={report?.contents_page ?? null} />
        </PopupPart>
      </>
    );
  }
  if (categoryKey === 'departments') {
    return (
      <PopupPart title="Suggested departments">
        <Departments departments={data.company.departments} />
      </PopupPart>
    );
  }
  // ESG: the frameworks found are the step's own value, already on the status line.
  return null;
}

/**
 * The 8 General info rows. A row with more detail (tone, revenue, net profit) opens
 * that detail in place, with a way back to the list.
 */
function GeneralDetails({ steps, data }: { steps: LiveStep[]; data: Extraction }) {
  const [detailKey, setDetailKey] = useState<SummaryKey | null>(null);
  if (detailKey) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          type="button"
          onClick={() => setDetailKey(null)}
          style={{
            alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11.5, fontWeight: 700, color: '#4040C8', background: 'none',
            border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to General info
        </button>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1D2E' }}>{POPUP_TITLES[detailKey]}</div>
        <SummaryDetails summaryKey={detailKey} data={data} />
      </div>
    );
  }
  return <LiveStepsTable steps={steps} onOpen={setDetailKey} />;
}
