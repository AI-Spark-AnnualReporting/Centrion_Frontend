// The board API owns the section registry and the resolver now. What's left on
// the client is a handful of transformations between a payload and a screen —
// and each one is a place the client can silently corrupt or discard server
// data. That's what these cover.

import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import type { BoardOutlineSection, BoardSourcesResponse } from '@/types/board';
import {
  boardProduceSummary,
  boardSheetWarning,
  boardCitations,
  boardContentMode,
  canRefineSection,
  initialStep,
  isBoardCoverSection,
  numberBoardHeadings,
  outlinePayload,
  profileFromCompany,
  readBoardConflict,
  readDuplicateSlots,
  readCompletionFromError,
  readExistingRunId,
  slotReceived,
  slotSystemKind,
} from '@/pages/annual-report/board-helpers';

const outlineSection = (over: Partial<BoardOutlineSection>): BoardOutlineSection => ({
  section_code: 'BR02',
  title: 'Chairman’s statement',
  category: 'Front',
  display_order: 2,
  requirement: 'O',
  resolution: 'in',
  included: true,
  content_type: 'narrative',
  carry_fwd: false,
  on_missing: 'omit',
  data_source: 'Chairman',
  source_document: 'Management narratives',
  note: null,
  status: 'pending',
  provenance: 'new',
  confirmed: false,
  ...over,
});

const sources = (slots: BoardSourcesResponse['slots']): BoardSourcesResponse => ({
  report_id: 'r1',
  period: 'FY-2025',
  received: slots.filter((s) => s.status === 'received').length,
  total: slots.length,
  slots,
});

const slot = (over: Partial<BoardSourcesResponse['slots'][number]>) => ({
  slot: 'Governance register',
  required: true,
  status: 'pending' as const,
  feeds: [],
  documents: [],
  ...over,
});

describe('profileFromCompany', () => {
  it('maps reporting_sector bank to the bank issuer type, everything else to corporate', () => {
    expect(profileFromCompany({ reporting_sector: 'bank' }).issuer_type).toBe('bank');
    for (const s of ['insurance', 'general', 'reit', 'finance_co']) {
      expect(profileFromCompany({ reporting_sector: s }).issuer_type).toBe('corporate');
    }
  });

  it('never emits insurer — the builder only offers two issuer pills', () => {
    const types = ['bank', 'insurance', 'general', 'reit', 'finance_co', null].map(
      (s) => profileFromCompany({ reporting_sector: s }).issuer_type,
    );
    expect(types).not.toContain('insurer');
  });

  it('reads bank off the sector name only when reporting_sector is unset', () => {
    expect(profileFromCompany({ sector_name: 'Banks' }).issuer_type).toBe('bank');
    // An explicit non-bank reporting_sector wins over a misleading sector name.
    expect(profileFromCompany({ reporting_sector: 'general', sector_name: 'Banks' }).issuer_type).toBe('corporate');
  });

  it('carries the sector through verbatim, whatever the lookup calls it', () => {
    expect(profileFromCompany({ sector_name: 'Oil, Gas & Consumable Fuels' }).sector)
      .toBe('Oil, Gas & Consumable Fuels');
    // Unmapped names are passed on rather than dropped — the server decides.
    expect(profileFromCompany({ sector_name: 'Diversified Holding' }).sector).toBe('Diversified Holding');
    // An explicitly resolved name wins over the join.
    expect(profileFromCompany({ sector_name: 'Health Care' }, 'Energy').sector).toBe('Energy');
  });

  it('leaves the sector null when the company has none', () => {
    expect(profileFromCompany({}).sector).toBeNull();
    expect(profileFromCompany({ sector_name: null }).sector).toBeNull();
  });

  it('passes the boolean flags through and never guesses the credit rating', () => {
    const p = profileFromCompany({ is_shariah: true, has_sukuk: true });
    expect(p.sharia_compliant).toBe(true);
    expect(p.has_capital_instruments).toBe(true);
    // No company field backs this one — guessing would add or drop a section.
    expect(p.externally_rated).toBe(false);
    expect(profileFromCompany({ is_shariah: null, has_sukuk: null })).toMatchObject({
      sharia_compliant: false,
      has_capital_instruments: false,
    });
  });
});

describe('initialStep', () => {
  it('opens an approved report on the report step', () => {
    expect(initialStep({ status: 'approved' }, null, null)).toBe(4);
    expect(initialStep({ status: 'locked' }, null, null)).toBe(4);
  });

  it('opens on the report step once anything has been produced', () => {
    expect(initialStep({ status: 'draft' }, null, [outlineSection({ status: 'produced' })])).toBe(4);
    expect(initialStep({ status: 'draft' }, null, [outlineSection({ status: 'locked' })])).toBe(4);
  });

  it('opens on sections once every required slot is in', () => {
    const all = sources([slot({ status: 'received' }), slot({ slot: 'Risk report', required: false })]);
    expect(initialStep({ status: 'draft' }, all, [outlineSection({})])).toBe(3);
  });

  it('opens on profile when required slots are still outstanding', () => {
    const some = sources([slot({ status: 'received' }), slot({ slot: 'Risk report' })]);
    expect(initialStep({ status: 'draft' }, some, [outlineSection({})])).toBe(1);
    expect(initialStep({ status: 'draft' }, null, null)).toBe(1);
    // No required slots at all is not "all required slots received".
    expect(initialStep({ status: 'draft' }, sources([]), null)).toBe(1);
  });
});

describe('outlinePayload', () => {
  it('sends every section, in order, with its current included flag', () => {
    const sections = [
      outlineSection({ section_code: 'BR01', included: true }),
      outlineSection({ section_code: 'BR08', resolution: 'dropped', included: false }),
      outlineSection({ section_code: 'BR02', included: true }),
    ];
    expect(outlinePayload(sections)).toEqual({
      sections: [
        { section_code: 'BR01', included: true },
        { section_code: 'BR08', included: false },
        { section_code: 'BR02', included: true },
      ],
    });
  });
});

describe('content shape helpers', () => {
  it('detects the cover by code and by payload, not by the quarterly /cover/i rule', () => {
    // The quarterly helper tests /cover/i against section_code — "BR01" fails it.
    expect(isBoardCoverSection({ section_code: 'BR01' })).toBe(true);
    expect(
      isBoardCoverSection({ section_code: 'BRXX', content: JSON.stringify({ template_key: 'board_cover' }) }),
    ).toBe(true);
    expect(isBoardCoverSection({ section_code: 'BR02', content: 'Prose.' })).toBe(false);
    expect(isBoardCoverSection({ section_code: 'BR07', content: JSON.stringify({ rows: [] }) })).toBe(false);
  });

  it('renders by content_type, which is authoritative', () => {
    // Narrative content is lifted verbatim from the source document — a string,
    // even when the source happens to look like JSON.
    expect(boardContentMode('narrative', '{"rows":[]}')).toBe('generate');
    expect(boardContentMode('generated', 'Revenue grew 11%.')).toBe('generate');
    expect(boardContentMode('table', '{"rows":[]}')).toBe('table');
    expect(boardContentMode('governance_grid', '{"columns":[],"rows":[]}')).toBe('table');
  });

  it('falls back to the payload shape when content_type is absent', () => {
    expect(boardContentMode(null, JSON.stringify({ rows: [] }))).toBe('table');
    expect(boardContentMode(undefined, JSON.stringify({ tables: [] }))).toBe('table');
    expect(boardContentMode('', 'The year was one of disciplined growth.')).toBe('generate');
    expect(boardContentMode(null, null)).toBe('generate');
  });
});

describe('canRefineSection', () => {
  const base = {
    section_code: 'BR24',
    content_type: 'narrative',
    status: 'produced' as const,
    content: 'Extracted text.',
  };

  it('applies to produced narrative sections that have text', () => {
    expect(canRefineSection(base)).toBe(true);
  });

  it('never applies to the three written in the company voice', () => {
    for (const code of ['BR02', 'BR03', 'BR04']) {
      expect(canRefineSection({ ...base, section_code: code })).toBe(false);
    }
  });

  it('does not apply to tables, unproduced sections, or empty content', () => {
    expect(canRefineSection({ ...base, content_type: 'table' })).toBe(false);
    expect(canRefineSection({ ...base, status: 'needs_input' })).toBe(false);
    expect(canRefineSection({ ...base, content: '   ' })).toBe(false);
    expect(canRefineSection({ ...base, content: null })).toBe(false);
  });
});

describe('boardCitations', () => {
  // This one white-screened the report: citations come back keyed by slot, and
  // calling .filter on an object throws during render, taking the page with it.
  it('reads the slot-keyed map the server actually sends', () => {
    expect(
      boardCitations({
        citations: {
          'Governance register': { source_ref: '05_Governance_Register.docx' },
          'Board member profiles / CVs': { source_ref: '03_Board_Member_Profiles.docx' },
        },
      }),
    ).toEqual([
      { slot: 'Governance register', source_ref: '05_Governance_Register.docx' },
      { slot: 'Board member profiles / CVs', source_ref: '03_Board_Member_Profiles.docx' },
    ]);
  });

  it('also reads a plain list, and a bare filename per slot', () => {
    expect(boardCitations({ citations: [{ slot: 'Risk report', source_ref: 'risk.pdf' }] })).toEqual([
      { slot: 'Risk report', source_ref: 'risk.pdf' },
    ]);
    expect(boardCitations({ citations: { 'Auditor’s report': 'auditor.docx' } })).toEqual([
      { slot: 'Auditor’s report', source_ref: 'auditor.docx' },
    ]);
  });

  it('returns nothing rather than throwing on anything unrecognised', () => {
    expect(boardCitations(null)).toEqual([]);
    expect(boardCitations(undefined)).toEqual([]);
    expect(boardCitations({ citations: null })).toEqual([]);
    expect(boardCitations({ citations: {} })).toEqual([]);
    expect(boardCitations({ citations: [] })).toEqual([]);
    expect(boardCitations({ citations: [null, 42] as never })).toEqual([]);
  });
});

describe('numberBoardHeadings', () => {
  it('numbers every heading in one sequence, from the section number', () => {
    const md = ['## Board composition', 'Twelve directors served.', '### Attendance', '## Fees'].join('\n');
    expect(numberBoardHeadings(md, 3).split('\n')).toEqual([
      '## 3.1 Board composition',
      'Twelve directors served.',
      '### 3.2 Attendance',
      '## 3.3 Fees',
    ]);
  });

  it('leaves the content alone when there is no number to count from', () => {
    expect(numberBoardHeadings('## Board composition', null)).toBe('## Board composition');
    expect(numberBoardHeadings('## Board composition', undefined)).toBe('## Board composition');
    expect(numberBoardHeadings(null, 3)).toBe('');
  });

  it('does not touch a line that only looks like a heading', () => {
    // No space after the hashes, and a mid-line hash — neither is a heading.
    expect(numberBoardHeadings('#NotAHeading\ncost #4 rose', 2)).toBe('#NotAHeading\ncost #4 rose');
  });
});

describe('boardProduceSummary', () => {
  const run = (output_summary: unknown) =>
    ({ output_summary } as unknown as Parameters<typeof boardProduceSummary>[0]);

  it('reads the counters out of an untyped output_summary', () => {
    expect(boardProduceSummary(run({ produced: 21, skipped: 3, failed: 0, total: 37 })))
      .toEqual({ produced: 21, skipped: 3, failed: 0, total: 37 });
  });

  it('degrades to null rather than throwing on an unexpected shape', () => {
    expect(boardProduceSummary(null)).toBeNull();
    expect(boardProduceSummary(run(null))).toBeNull();
    expect(boardProduceSummary(run({ results: [] }))).toBeNull();
    expect(boardProduceSummary(run({ produced: '21', total: 37 }))).toBeNull();
  });

  it('defaults the optional counters', () => {
    expect(boardProduceSummary(run({ produced: 5, total: 10 })))
      .toEqual({ produced: 5, total: 10, skipped: 0, failed: 0 });
  });
});

describe('boardSheetWarning', () => {
  const run = (output_summary: unknown) =>
    ({ output_summary } as unknown as Parameters<typeof boardSheetWarning>[0]);

  it('prefers the server’s own wording', () => {
    expect(
      boardSheetWarning(
        run({ unrendered_sheets: ['HR_Saudization'], warning: '1 sheet appears as raw text.' }),
      ),
    ).toBe('1 sheet appears as raw text.');
  });

  it('builds one from the sheet list when no wording was sent', () => {
    expect(boardSheetWarning(run({ unrendered_sheets: ['HR_Saudization', 'Fines'] }))).toBe(
      '2 spreadsheet sheets produced no table and appear as raw text: HR_Saudization, Fines.',
    );
  });

  it('is silent when nothing went wrong, and never throws', () => {
    expect(boardSheetWarning(run({ produced: 5, total: 10 }))).toBeNull();
    expect(boardSheetWarning(run({ unrendered_sheets: [] }))).toBeNull();
    expect(boardSheetWarning(run({ unrendered_sheets: 'HR' }))).toBeNull();
    expect(boardSheetWarning(run({ warning: '   ' }))).toBeNull();
    expect(boardSheetWarning(null)).toBeNull();
  });
});

describe('error-body readers', () => {
  const conflict = (body: unknown) => new ApiError(409, 'Conflict', body, '/api/v1/board/reports');

  it('pulls the existing report id out of a create 409, whatever it is nested under', () => {
    expect(readBoardConflict(conflict({ detail: { existing_report_id: 'r-9' } })).reportId).toBe('r-9');
    expect(readBoardConflict(conflict({ existing_report_id: 'r-9' })).reportId).toBe('r-9');
    expect(readBoardConflict(conflict({ detail: 'Already exists' })).message).toBe('Already exists');
    // No id to offer — still a usable message, never a crash.
    expect(readBoardConflict(conflict({})).reportId).toBeNull();
    expect(readBoardConflict(conflict({})).message).toContain('already exists');
  });

  it('pulls the in-flight run id out of an upload 409 so the UI can adopt it', () => {
    expect(readExistingRunId(conflict({ detail: { existing_run_id: 'run-1' } }))).toBe('run-1');
    expect(readExistingRunId(conflict({ existing_run_id: 'run-1' }))).toBe('run-1');
    expect(readExistingRunId(new ApiError(422, 'Unprocessable', {}, '/x'))).toBeNull();
    expect(readExistingRunId(new Error('network'))).toBeNull();
  });

  it('names the slots when the same document is filed twice', () => {
    const err = new ApiError(
      422,
      'Unprocessable',
      {
        detail: {
          error: 'The same document content was filed under different slots — pick one.',
          duplicates: [
            { slots: ['Board member profiles', 'Compliance & penalties log'], files: ['profiles.docx'] },
            { slots: ['Board member profiles', 'Risk management report'], files: ['profiles.docx'] },
          ],
        },
      },
      '/api/v1/board/reports/r1/sources/upload',
    );
    const dupes = readDuplicateSlots(err);
    expect(dupes?.message).toContain('filed under different slots');
    // De-duplicated across groups, so a slot is highlighted once.
    expect(dupes?.slots).toEqual([
      'Board member profiles',
      'Compliance & penalties log',
      'Risk management report',
    ]);
  });

  it('is not a duplicate error without a duplicates list', () => {
    expect(readDuplicateSlots(new ApiError(422, 'Unprocessable', { detail: 'Unknown slot' }, '/x'))).toBeNull();
    expect(readDuplicateSlots(new ApiError(409, 'Conflict', { duplicates: [] }, '/x'))).toBeNull();
    expect(readDuplicateSlots(new Error('network'))).toBeNull();
  });

  it('reads the approve 409 body as a completion payload', () => {
    const payload = {
      total: 37,
      ready: 33,
      awaiting_data: ['BR35', 'BR38'],
      pending_confirmation: ['BR32'],
      not_produced: [],
      can_approve: false,
    };
    expect(readCompletionFromError(conflict(payload))).toEqual(payload);
    expect(readCompletionFromError(conflict({ detail: payload }))).toEqual(payload);
  });

  it('returns null for a 409 that is not a completion payload', () => {
    expect(readCompletionFromError(conflict({ detail: 'Report is locked' }))).toBeNull();
    expect(readCompletionFromError(new ApiError(500, 'Server Error', {}, '/x'))).toBeNull();
  });
});

describe('slotSystemKind', () => {
  const feed = (section_code: string) => ({
    section_code,
    title: 'x',
    requirement: 'M' as const,
    on_missing: 'block' as const,
  });

  it('reads the kind the server sent for a meetings slot', () => {
    expect(slotSystemKind(slot({ kind: 'meetings', section_code: 'BR35' }))).toBe('meetings');
  });

  it('spots the profiles slot by the section it feeds, not by its name', () => {
    // The slot is called "Board member profiles / CVs" today and will be
    // reworded; BR32 is the registry's and will not.
    expect(slotSystemKind(slot({ slot: 'Anything at all', feeds: [feed('BR32')] }))).toBe('profiles');
  });

  it('leaves an ordinary document slot upload-only', () => {
    expect(slotSystemKind(slot({ feeds: [feed('BR19')] }))).toBeNull();
    // `kind` is omitted entirely on document rows.
    expect(slotSystemKind(slot({}))).toBeNull();
  });
});

describe('slotReceived', () => {
  it('counts a meetings slot with a saved selection, whatever its status says', () => {
    expect(slotReceived(slot({ kind: 'meetings', selected_count: 3 }))).toBe(true);
    expect(slotReceived(slot({ kind: 'meetings', selected_ids: ['a', 'b'] }))).toBe(true);
    // Otherwise the row says "3 selected" while the counter says 0 received and
    // Continue stays blocked.
    expect(slotReceived(slot({ kind: 'meetings', selected_count: 0 }))).toBe(false);
  });

  it('still defers to the server for a document slot', () => {
    expect(slotReceived(slot({ status: 'received' }))).toBe(true);
    expect(slotReceived(slot({}))).toBe(false);
  });
});
