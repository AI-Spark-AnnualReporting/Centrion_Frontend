import type { EarningsProducedSection } from '@/types/earnings';
import { CoverRenderer } from '@/components/quarterly/CoverRenderer';
import {
  isCoverMode,
  isTableMode,
  isQuoteMode,
  isReconciliationMode,
  isSourcesMode,
  readCoverValues,
  tryParseJson,
  isRecord,
} from '@/pages/earnings/preview-helpers';
import { SectionTable } from './SectionTable';
import { ReconciliationTable } from './ReconciliationTable';
import { QuoteBlock } from './QuoteBlock';
import { SourcesList } from './SourcesList';
import { MUTED } from './tokens';
import { MarkdownProse as Prose } from '@/components/quarterly/SectionContent';

// Dispatch a produced section by content shape: cover → CoverRenderer (reused from
// quarterly), table/kpi → SectionTable (label + value only), else prose.
export function SectionRenderer({
  section,
  coverTemplateKey,
}: {
  section: EarningsProducedSection;
  coverTemplateKey?: string | null;
}) {
  const content = section.content;

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
    return <QuoteBlock content={content} />;
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
    return <ReconciliationTable content={content} />;
  }

  if (isSourcesMode(section)) {
    if (content == null || content.trim() === '') {
      const pending = section.status === 'pending';
      return (
        <p style={{ margin: 0, fontSize: 13, color: MUTED, fontStyle: pending ? 'italic' : 'normal' }}>
          {pending ? 'This section is awaiting generation.' : 'No data available for this section.'}
        </p>
      );
    }
    return <SourcesList content={content} />;
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
    if (tryParseJson(content) === undefined) return <Prose text={content} />;
    return <SectionTable content={content} />;
  }

  // Fallback: some sections (e.g. Reporting Calendar / IR Contact) carry a
  // structured JSON envelope ({title, entries:[…]} / {rows:[…]} / an array of
  // objects) even though their mode isn't a known tabular one. Render that as a
  // label/value table rather than dumping raw JSON. Plain prose never JSON-parses
  // to an object/array, so it still falls through to <Prose>.
  const parsed = tryParseJson(content);
  if (parsed !== undefined && (Array.isArray(parsed) || isRecord(parsed))) {
    return <SectionTable content={content} />;
  }

  return <Prose text={content} />;
}
