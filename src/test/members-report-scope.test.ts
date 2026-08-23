import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { communications } from '@/lib/api';

// The assign/reassign pickers pass report_id; the @mention picker must not.
describe('communications.members', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ members: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const calledUrl = () => String(fetchMock.mock.calls[0][0]);

  it('omits report_id when none is given', async () => {
    await communications.members();
    expect(calledUrl()).not.toContain('report_id');
  });

  it('sends report_id when given', async () => {
    await communications.members('rep-1');
    expect(calledUrl()).toContain('report_id=rep-1');
  });
});
