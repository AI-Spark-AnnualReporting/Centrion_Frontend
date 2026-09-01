import type { EarningsProducedSection } from '@/types/earnings';
import { canonicalMoneyInText } from '@/components/quarterly/figureUnits';
import { CoverRenderer } from '@/components/quarterly/CoverRenderer';
import {
  isCoverMode,
  isTableMode,
  isQuoteMode,
  isReconciliationMode,
  readCoverValues,
  readNarrativeEnvelope,
  tryParseJson,
  isRecord,
} from '@/pages/earnings/preview-helpers';
import { SectionTable } from './SectionTable';
import { ReconciliationTable } from './ReconciliationTable';
import { QuoteBlock } from './QuoteBlock';
import { INK, MUTED } from './tokens';
import { AnalysisText, MarkdownProse } from '@/components/quarterly/SectionContent';

// Prose block — Markdown-rendered (headings, bullets, GFM tables), with raw
// storage-token money references ("248,891 SAR_million") rewritten to their
// canonical display form first, so the screen reads like the file.
function Prose({ text }: { text: string }) {
  return <MarkdownProse text={canonicalMoneyInText(text)} />;
}

// Dispatch a produced section by content shape: cover → CoverRenderer (reused from
// quarterly), table/kpi → SectionTable (label + value only), else prose.
export function SectionRenderer({
  section,
  coverTemplateKey,
  deliverable = false,
  showAnalysis = false,
}: {
  section: EarningsProducedSection;
  coverTemplateKey?: string | null;
  /** Forwarded to SectionTable — the finished report drops rows that can never
   *  carry a figure, the workbench keeps them. */
  deliverable?: boolean;
  /** Print the section's stored analysis under its body. Off by default: Preview
   *  owns the interactive Analyse control, and only the Report screen prints the
   *  finished result — the same split quarterly draws between Preview and the
   *  assembled report. */
  showAnalysis?: boolean;
}) {
  const content = section.content;

  // Wraps whatever the dispatch below returns, so the analysis prints under every
  // shape — table, reconciliation, narrative envelope, prose. report_export does
  // the same thing for the same reason: the analysis belongs to the section, not
  // to one particular content shape, so it is appended outside the mode branches.
  const withAnalysis = (body: React.ReactNode) => {
    const text = showAnalysis ? (section.analysis?.text ?? '').trim() : '';
    if (!text) return body;
    return (
      <>
        {body}
        <AnalysisText text={text} />
      </>
    );
  };

  if (isCoverMode(section)) {
    const cv = readCoverValues(content, coverTemplateKey ?? null);
    return (
      <CoverRenderer
        companyName={cv.companyName}
        period={cv.period}
        title={cv.title ?? section.title}
        preparedOn={cv.preparedOn}
        templateKey={cv.templateKey}
        maxWidth={820}
      />
    );
  }

  // Management commentary (S05) — QuoteBlock itself returns null when the
  // backend omitted it (no placeholder, ever), so no empty-content branch here.
  if (isQuoteMode(section)) {
    return withAnalysis(<QuoteBlock content={content} />);
  }

  if (isReconciliationMode(section)) {
    if (content == null || content.trim() === '') {
      const pending = section.status === 'pending';
      return (
        <p style={{ margin: 0, fontSize: 13, color: MUTED, fontStyle: pending ? 'italic' : 'normal' }}>
          {pending ? 'This section is awaiting generation.' : 'No data available for this section.'}
        </p>
      );
    }
    return withAnalysis(<ReconciliationTable content={content} />);
  }

  if (content == null || content.trim() === '') {
    const pending = section.status === 'pending';
    return (
      <p style={{ margin: 0, fontSize: 13, color: MUTED, fontStyle: pending ? 'italic' : 'normal' }}>
        {pending ? 'This section is awaiting generation.' : 'No data available for this section.'}
      </p>
    );
  }

  if (isTableMode(section)) {
    // Table mode but non-JSON content → treat the string as prose; otherwise render
    // the metric/value table.
    if (tryParseJson(content) === undefined) return withAnalysis(<Prose text={content} />);
    return withAnalysis(<SectionTable content={content} deliverable={deliverable} />);
  }

  // A `{heading, content}` narrative envelope (Financial Review/MD&A, Executive
  // Summary, Capital Allocation — written from the report's own figures) reads
  // as a heading line + real prose, not a label/value dump of its two keys.
  // Checked before the generic table fallback below, which would otherwise
  // print "heading" / "content" as table rows.
  const narrative = readNarrativeEnvelope(content);
  if (narrative) {
    return withAnalysis(
      <>
        {narrative.heading && (
          <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: INK }}>
            {narrative.heading}
          </h3>
        )}
        <Prose text={narrative.body} />
      </>,
    );
  }

  // Fallback: some sections (e.g. Reporting Calendar / IR Contact) carry a
  // structured JSON envelope ({title, entries:[…]} / {rows:[…]} / an array of
  // objects) even though their mode isn't a known tabular one. Render that as a
  // label/value table rather than dumping raw JSON. Plain prose never JSON-parses
  // to an object/array, so it still falls through to <Prose>.
  const parsed = tryParseJson(content);
  if (parsed !== undefined && (Array.isArray(parsed) || isRecord(parsed))) {
    return withAnalysis(<SectionTable content={content} deliverable={deliverable} />);
  }

  return withAnalysis(<Prose text={content} />);
}
