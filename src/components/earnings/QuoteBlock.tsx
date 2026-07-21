import { tryParseJson, isRecord, cell } from '@/pages/earnings/preview-helpers';
import { ACCENT, INK, MUTED } from './tokens';

// Management commentary (S05) — verbatim quote + attribution. Field names
// unconfirmed (Step 0); read defensively across the likely aliases.
export function QuoteBlock({ content }: { content: string | null }) {
  const parsed = content ? tryParseJson(content) : undefined;
  const o = isRecord(parsed) ? parsed : {};
  const quote = cell(o, 'quote', 'text');
  // Omitted by design — no placeholder, no "quote unavailable" (D-12/D-20).
  if (typeof quote !== 'string' || quote.trim() === '') return null;

  const attribution = isRecord(o.attribution) ? o.attribution : o;
  const name = cell(attribution, 'name', 'attributed_to');
  const title = cell(attribution, 'title', 'role');
  const hasAttribution = typeof name === 'string' && name !== '' || typeof title === 'string' && title !== '';

  return (
    <div>
      <blockquote
        style={{
          margin: 0,
          borderLeft: `3px solid ${ACCENT}`,
          paddingLeft: 16,
          fontSize: 15,
          fontStyle: 'italic',
          color: INK,
          lineHeight: 1.7,
        }}
      >
        "{quote}"
      </blockquote>
      {hasAttribution && (
        <p style={{ margin: '10px 0 0 19px', fontSize: 12.5, color: MUTED }}>
          — {[name, title].filter((v): v is string => typeof v === 'string' && v !== '').join(', ')}
        </p>
      )}
    </div>
  );
}
