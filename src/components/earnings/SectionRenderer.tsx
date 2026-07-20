import type { EarningsProducedSection } from '@/types/earnings';
import { CoverRenderer } from '@/components/quarterly/CoverRenderer';
import { isCoverMode, isTableMode, readCoverValues, tryParseJson } from '@/pages/earnings/preview-helpers';
import { SectionTable } from './SectionTable';
import { MUTED } from './tokens';

// Prose block — split on blank lines into justified paragraphs, never a JSON blob.
function Prose({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const blocks = paragraphs.length ? paragraphs : [text];
  return (
    <>
      {blocks.map((p, i) => (
        <p
          key={i}
          style={{
            margin: i === 0 ? 0 : '14px 0 0',
            fontSize: 14,
            lineHeight: 1.75,
            color: '#2A2E47',
            whiteSpace: 'pre-wrap',
            textAlign: 'justify',
          }}
        >
          {p}
        </p>
      ))}
    </>
  );
}

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

  if (content == null || content.trim() === '') {
    return <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No data available for this section.</p>;
  }

  if (isTableMode(section)) {
    // Table mode but non-JSON content → treat the string as prose; otherwise render
    // the metric/value table.
    if (tryParseJson(content) === undefined) return <Prose text={content} />;
    return <SectionTable content={content} />;
  }

  return <Prose text={content} />;
}
