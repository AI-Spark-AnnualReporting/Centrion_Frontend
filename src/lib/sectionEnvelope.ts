// The `{heading, content}` envelope that the RAG narrative producers write.
//
// agents/narrative/section_producer.py::produce_rag_narrative stores a section's
// prose as json.dumps({"heading": ..., "content": ...}) — the report prints that
// heading as a sub-title above the paragraph. Quarterly and earnings both hold it,
// and BOTH used to duplicate the parsing: quarterly inline in SectionContent, and
// earnings in pages/earnings/preview-helpers. Each grew its own gaps, which is how
// the same bug ended up in two separate edit boxes. One copy now, shared.
//
// Detection is by SHAPE ONLY — never by section_code and never by mode. Earnings
// s08_financial_review stores an envelope when a quarterly report is linked and a
// bare string otherwise (routes/earnings.py:4445), and mode is 'generate' either
// way. The backend exporters sniff the shape for exactly this reason; see
// report_export.py::_is_narrative_envelope, which this mirrors.

export interface NarrativeEnvelope {
  heading: string | null;
  body: string;
}

// Accepts either the stored JSON string or an already-parsed object: the
// quarterly /assemble response hands sections back as objects rather than
// strings, and a caller that forgot to re-stringify would otherwise get a
// silent null here instead of its envelope.
function tryParse(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The prose and sub-heading inside a stored section, or null when the string is
 * not an envelope — plain prose, a table, or JSON a user has broken by hand. A
 * null answer means "treat the whole string as the text", which is what keeps a
 * mangled section editable instead of stranded.
 */
export function readNarrativeEnvelope(content: unknown): NarrativeEnvelope | null {
  if (!content) return null;
  const parsed = tryParse(content);
  if (!isRecord(parsed)) return null;
  // produce_hybrid writes {title, rows, analysis} — a real table, and its own
  // branch. Without this guard a table whose object happens to carry a string
  // `content` key would render (and edit) as a paragraph. Same exclusion the
  // exporters apply.
  if (parsed.rows || parsed.tables) return null;
  const body = parsed.content;
  if (typeof body !== 'string' || body.trim() === '') return null;
  const heading =
    typeof parsed.heading === 'string' && parsed.heading.trim() !== '' ? parsed.heading : null;
  return { heading, body };
}

/**
 * Put edited text back into the envelope it came from.
 *
 * Spreads the ORIGINAL parsed object so keys neither the editor nor this module
 * knows about survive the round-trip — the same thing the backend's refine path
 * does with its `rewrap` closure (routes/earnings.py:6355). When the original was
 * not an envelope the edited text is returned as-is, so plain-prose sections and
 * hand-broken ones stay plain strings rather than being silently wrapped into a
 * shape the producer never gave them.
 */
export function writeNarrativeEnvelope(
  original: unknown,
  heading: string | null,
  body: string,
): string {
  if (!readNarrativeEnvelope(original)) return body;
  const parsed = tryParse(original);
  const base = isRecord(parsed) ? parsed : {};
  const trimmed = (heading ?? '').trim();
  return JSON.stringify({ ...base, heading: trimmed || null, content: body });
}
