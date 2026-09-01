// The subheadings step. The server proposes the headings and the reviewer only
// shapes them, which puts three server rules in the client's hands:
//
//   · a heading's `id` is the ONLY thing distinguishing a rename from an
//     addition, and additions are a 422 — drop it and every rename fails
//   · array order IS the saved order, and an omitted id is a deletion
//   · a heading cannot move between sections; the API has no way to say it
//
// Each one is a place the client can silently corrupt or discard server data
// with nothing failing loudly. That's what these cover.

import { describe, expect, it } from 'vitest';
import type { BoardSubheadingReason, BoardSubheadingSection } from '@/types/board';
import {
  isSubheadingSectionHidden,
  reorderSubheadings,
  subheadingReasonBadge,
  subheadingsPayload,
} from '@/pages/annual-report/board-helpers';

const section = (over: Partial<BoardSubheadingSection>): BoardSubheadingSection => ({
  section_code: 'BR05',
  title: 'Governance framework',
  category: 'Governance',
  display_order: 5,
  editable: true,
  reason_code: null,
  reason: null,
  subheadings: [
    { id: 1, heading: 'Board composition' },
    { id: 2, heading: 'Committee mandates' },
    { id: 3, heading: 'Meeting attendance' },
  ],
  source_paragraph_count: 12,
  ...over,
});

describe('subheadingsPayload', () => {
  it('keeps every id and the array order', () => {
    const body = subheadingsPayload([section({})], ['BR05']);
    expect(body.sections).toEqual([
      {
        section_code: 'BR05',
        subheadings: [
          { id: 1, heading: 'Board composition' },
          { id: 2, heading: 'Committee mandates' },
          { id: 3, heading: 'Meeting attendance' },
        ],
      },
    ]);
  });

  it('sends only the sections that changed', () => {
    const all = [section({}), section({ section_code: 'BR06', title: 'Risk management' })];
    const body = subheadingsPayload(all, ['BR06']);
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0].section_code).toBe('BR06');
  });

  it('sends nothing when nothing changed', () => {
    expect(subheadingsPayload([section({})], []).sections).toEqual([]);
  });

  it('preserves the id on a rename — a dropped id is a rejected add', () => {
    const renamed = section({
      subheadings: [
        { id: 1, heading: 'How the board is composed' },
        { id: 2, heading: 'Committee mandates' },
        { id: 3, heading: 'Meeting attendance' },
      ],
    });
    const [saved] = subheadingsPayload([renamed], ['BR05']).sections;
    expect(saved.subheadings[0]).toEqual({ id: 1, heading: 'How the board is composed' });
  });

  it('expresses a delete as omission, leaving the other ids intact', () => {
    const deleted = section({
      subheadings: [
        { id: 1, heading: 'Board composition' },
        { id: 3, heading: 'Meeting attendance' },
      ],
    });
    const [saved] = subheadingsPayload([deleted], ['BR05']).sections;
    expect(saved.subheadings.map((h) => h.id)).toEqual([1, 3]);
  });
});

describe('reorderSubheadings', () => {
  it('moves a heading within its section', () => {
    const next = reorderSubheadings(
      [section({})],
      { sectionCode: 'BR05', index: 2 },
      { sectionCode: 'BR05', index: 0 },
    );
    expect(next[0].subheadings.map((h) => h.id)).toEqual([3, 1, 2]);
  });

  it('refuses a cross-section drag rather than dropping the heading', () => {
    const all = [section({}), section({ section_code: 'BR06', subheadings: [] })];
    const next = reorderSubheadings(
      all,
      { sectionCode: 'BR05', index: 0 },
      { sectionCode: 'BR06', index: 0 },
    );
    expect(next).toBe(all);
    expect(next[0].subheadings).toHaveLength(3);
    expect(next[1].subheadings).toHaveLength(0);
  });

  it('leaves the list alone for a no-op or an out-of-range index', () => {
    const all = [section({})];
    for (const to of [0, -1, 9]) {
      const next = reorderSubheadings(all, { sectionCode: 'BR05', index: 0 }, { sectionCode: 'BR05', index: to });
      expect(next[0].subheadings.map((h) => h.id)).toEqual([1, 2, 3]);
    }
  });

  it('does not touch the other sections', () => {
    const other = section({ section_code: 'BR06' });
    const next = reorderSubheadings(
      [section({}), other],
      { sectionCode: 'BR05', index: 0 },
      { sectionCode: 'BR05', index: 1 },
    );
    expect(next[1]).toBe(other);
  });
});

describe('isSubheadingSectionHidden', () => {
  it('hides not_applicable rows and nothing else', () => {
    expect(isSubheadingSectionHidden({ reason_code: 'not_applicable' })).toBe(true);
    const shown: (BoardSubheadingReason | null)[] = [
      null,
      'excluded',
      'generated',
      'no_producer',
      'statement_table',
      'governance_table',
      'metric_table',
    ];
    for (const reason_code of shown) {
      expect(isSubheadingSectionHidden({ reason_code })).toBe(false);
    }
  });
});

describe('subheadingReasonBadge', () => {
  it('maps every reason code without returning undefined', () => {
    const codes: (BoardSubheadingReason | null)[] = [
      'not_applicable',
      'excluded',
      'generated',
      'no_producer',
      'statement_table',
      'governance_table',
      'metric_table',
      null,
    ];
    for (const code of codes) {
      const badge = subheadingReasonBadge(code);
      expect(badge === null || typeof badge === 'string').toBe(true);
      expect(badge).not.toBe(undefined);
    }
  });

  it('calls the three table shapes TABLE', () => {
    expect(subheadingReasonBadge('statement_table')).toBe('TABLE');
    expect(subheadingReasonBadge('governance_table')).toBe('TABLE');
    expect(subheadingReasonBadge('metric_table')).toBe('TABLE');
  });

  it('names the other reasons distinctly', () => {
    expect(subheadingReasonBadge('generated')).toBe('TEMPLATE');
    expect(subheadingReasonBadge('no_producer')).toBe('NOT AUTOMATED');
    expect(subheadingReasonBadge('excluded')).toBe('EXCLUDED');
  });

  it('has no badge for an editable row', () => {
    expect(subheadingReasonBadge(null)).toBeNull();
  });
});
