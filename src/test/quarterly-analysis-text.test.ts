// Reading the Analyse button's commentary back out of one stored string.
//
// This is the frontend half of a rule that exists three times: split_analysis in
// agents/narrative/section_analysis.py, _analysis_blocks in report_export.py, and
// splitAnalysis here. The report a user reads on screen and the PDF they hand to an
// investor must not disagree about what a "- " at the start of a line means, so this
// suite is a deliberate line-for-line twin of TestSplitAnalysis in the backend's
// tests/test_section_analysis.py. Change one, change all three.

import { describe, it, expect } from 'vitest';
import { splitAnalysis } from '@/components/quarterly/analysisText';

describe('reading a stored analysis', () => {
  it('reads a canonical bullet list', () => {
    expect(splitAnalysis('- Alpha rose.\n- Beta fell.')).toEqual({
      kind: 'bullets',
      items: ['Alpha rose.', 'Beta fell.'],
    });
  });

  it('reads legacy paragraphs as paragraphs', () => {
    // Never migrated, so this shape has to keep working forever.
    expect(splitAnalysis('First para.\n\nSecond para.')).toEqual({
      kind: 'paragraphs',
      items: ['First para.', 'Second para.'],
    });
  });

  it('accepts the markers a model actually emits', () => {
    // Told "no markdown", GPT still reaches for these.
    expect(splitAnalysis('• Alpha.\n* Beta.\n– Gamma.\n— Delta.').items).toEqual([
      'Alpha.', 'Beta.', 'Gamma.', 'Delta.',
    ]);
  });

  it('absorbs a stray intro line rather than losing it', () => {
    expect(splitAnalysis('Here is the summary.\n- Alpha.\n- Beta.')).toEqual({
      kind: 'bullets',
      items: ['Here is the summary.', 'Alpha.', 'Beta.'],
    });
  });

  it('does not read a line opening with a negative number as a bullet', () => {
    // The marker must be followed by whitespace, or a movement written as
    // "-1,755 was the movement" would be read as a bullet and lose its sign.
    expect(splitAnalysis('-1,755 was the movement this quarter.').kind).toBe('paragraphs');
  });

  it('never lets a literal marker reach the page', () => {
    for (const text of ['- Alpha.\n- Beta.', '• Alpha.\n• Beta.', 'Intro.\n- Alpha.\n- Beta.']) {
      for (const item of splitAnalysis(text).items) {
        expect(item).not.toMatch(/^[-–—•*]/);
      }
    }
  });

  it('yields nothing for empty, blank or missing text', () => {
    for (const text of ['', '   \n\n  ', null, undefined]) {
      expect(splitAnalysis(text)).toEqual({ kind: 'paragraphs', items: [] });
    }
  });

  it('treats a single bullet as a list, not as prose with a dash in it', () => {
    expect(splitAnalysis('- Only one point.')).toEqual({
      kind: 'bullets',
      items: ['Only one point.'],
    });
  });

  it('drops blank lines between bullets', () => {
    expect(splitAnalysis('- Alpha.\n\n- Beta.').items).toEqual(['Alpha.', 'Beta.']);
  });
});
