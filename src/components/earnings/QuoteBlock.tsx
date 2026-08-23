import { tryParseJson, isRecord, cell } from '@/pages/earnings/preview-helpers';
import { BRAND, INK, MUTED } from './tokens';

// Management commentary (S05) — verbatim quote + attribution. Field names
// unconfirmed (Step 0); read defensively across the likely aliases. Confirmed
// live: this section can also come back as the `{heading, content}` envelope
// Financial Review/MD&A uses (a full commentary paragraph, not a short
// verbatim line) — `content` is read as a last-resort alias for the quote
// text so that shape doesn't silently render nothing.
export function QuoteBlock({ content }: { content: string | null }) {
  const parsed = content ? tryParseJson(content) : undefined;
  const o = isRecord(parsed) ? parsed : {};
  const quote = cell(o, 'quote', 'text', 'content');
  // Omitted by design — no placeholder, no "quote unavailable" (D-12/D-20).
  if (typeof quote !== 'string' || quote.trim() === '') return null;

  const heading = typeof o.heading === 'string' && o.heading.trim() !== '' ? o.heading : null;
  const attribution = isRecord(o.attribution) ? o.attribution : o;
  const name = cell(attribution, 'name', 'attributed_to');
  const title = cell(attribution, 'title', 'role');
  const hasAttribution = typeof name === 'string' && name !== '' || typeof title === 'string' && title !== '';

  return (
    <div>
      {heading && (
        <h3 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 800, color: INK }}>{heading}</h3>
      )}
      <blockquote
        style={{
          margin: 0,
          borderLeft: `3px solid ${BRAND}`,
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
