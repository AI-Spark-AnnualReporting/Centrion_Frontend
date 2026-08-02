// The board API owns the section registry and the resolver now. What's left on
// the client is a handful of transformations between a payload and a screen —
// and each one is a place the client can silently corrupt or discard server
// data. That's what these cover.

import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import type { BoardOutlineSection, BoardSourcesResponse } from '@/types/board';
import {
  boardProduceSummary,
  inferBoardMode,
  initialStep,
  isBoardCoverSection,
  outlinePayload,
  profileFromCompany,
  readBoardConflict,
  readDuplicateSlots,
  readCompletionFromError,
  readExistingRunId,
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

  it('infers a mode for GET /sections, which sends none', () => {
    expect(inferBoardMode(JSON.stringify({ rows: [] }))).toBe('table');
    expect(inferBoardMode(JSON.stringify({ tables: [] }))).toBe('table');
    expect(inferBoardMode('The year was one of disciplined growth.')).toBe('prose');
    expect(inferBoardMode(null)).toBe('prose');
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
