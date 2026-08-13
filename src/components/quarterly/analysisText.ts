// One shared rule for reading the Analyse button's commentary, mirrored from
// agents/narrative/section_analysis.py (split_analysis) and report_export.py
// (_analysis_blocks) — the screen and the download must agree about what a "- " at
// the start of a line means, so all three change together.
//
// Two shapes reach us and both must render correctly forever:
//   • the bullet list written now — one point per line, each prefixed "- ";
//   • blank-line paragraphs, written before the format changed and still typed by
//     hand into the editor. Those keep rendering exactly as they always have.

// DETECT demands whitespace after the marker so a line opening with a negative
// number ("-1,755 was the movement") is not read as a bullet; STRIP allows none, so
// a sloppy "-Revenue rose" inside an otherwise-bulleted reply still cleans up. The
// dashes and star are here because a model told "no markdown" still reaches for "•"
// or "*", and substitutes an en/em dash for "-" often enough to matter.
const BULLET_LINE = /^[-–—•*]\s+/;
const BULLET_STRIP = /^[-–—•*]\s*/;

export type AnalysisShape = { kind: 'bullets' | 'paragraphs'; items: string[] };

export function splitAnalysis(text: string | null | undefined): AnalysisShape {
  const t = (text ?? '').trim();
  if (!t) return { kind: 'paragraphs', items: [] };

  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => BULLET_LINE.test(l)).length;

  // A list when EVERY non-blank line is a bullet, or when bullets are a strict
  // majority — the majority arm catches a model that opened with an intro line or
  // closed with a summary one. Every line is then marker-stripped, the stray ones
  // included, so nothing is lost and a literal "- " can never reach the page.
  if (bullets && (bullets === lines.length || bullets * 2 > lines.length)) {
    const items = lines.map((l) => l.replace(BULLET_STRIP, '').trim()).filter(Boolean);
    return { kind: 'bullets', items };
  }

  return {
    kind: 'paragraphs',
    items: t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
  };
}
