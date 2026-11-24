// The sidebar, the license banner and the Admin Console's License card each
// fetched GET /admin/license on their own: 3-4 identical ~4 s requests per page,
// run one after another, so the card took ~11 s (QA audit AC-04). They now share
// one request through lib/license-cache.ts.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const licenseGet = vi.fn();
let token: string | null = 'token-a';
let acting: { id: string; name: string } | null = null;

vi.mock('@/lib/api', () => ({
  license: { get: () => licenseGet() },
  getAuthToken: () => token,
}));
vi.mock('@/lib/acting-company', () => ({ getActingCompany: () => acting }));

const {
  LICENSE_FRESH_FOR_MS,
  clearCompanyLicense,
  loadCompanyLicense,
  setCompanyLicense,
  subscribeCompanyLicense,
} = await import('@/lib/license-cache');

const LICENSE = { status: 'active', modules: ['annual_report'] } as never;
const NEWER = { status: 'active', modules: ['annual_report', 'esg_validator'] } as never;

describe('shared license cache', () => {
  beforeEach(() => {
    clearCompanyLicense();
    licenseGet.mockReset().mockResolvedValue(LICENSE);
    token = 'token-a';
    acting = null;
  });
  afterEach(() => vi.useRealTimers());

  it('gives everyone asking at once the same single request', async () => {
    const answers = await Promise.all([loadCompanyLicense(), loadCompanyLicense(), loadCompanyLicense()]);
    expect(licenseGet).toHaveBeenCalledTimes(1);
    expect(answers).toEqual([LICENSE, LICENSE, LICENSE]);
  });

  it('reuses the answer for 30 s, then asks again', async () => {
    vi.useFakeTimers();
    await loadCompanyLicense();
    vi.advanceTimersByTime(LICENSE_FRESH_FOR_MS - 1);
    await loadCompanyLicense();
    expect(licenseGet).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    await loadCompanyLicense();
    expect(licenseGet).toHaveBeenCalledTimes(2);
  });

  it('fresh: true always asks the server (the banner waiting for activation)', async () => {
    await loadCompanyLicense();
    await loadCompanyLicense({ fresh: true });
    expect(licenseGet).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failure: the caller gets the error and the next call retries', async () => {
    licenseGet.mockRejectedValueOnce(new Error('network down'));
    await expect(loadCompanyLicense()).rejects.toThrow('network down');
    await expect(loadCompanyLicense()).resolves.toEqual(LICENSE);
    expect(licenseGet).toHaveBeenCalledTimes(2);
  });

  it('never shares a license between companies Spark staff act as', async () => {
    acting = { id: 'cmp_a', name: 'A' };
    await loadCompanyLicense();
    acting = { id: 'cmp_b', name: 'B' };
    await loadCompanyLicense();
    expect(licenseGet).toHaveBeenCalledTimes(2);
  });

  it('never shares a license between two logins on the same browser', async () => {
    await loadCompanyLicense();
    token = 'token-b';
    await loadCompanyLicense();
    expect(licenseGet).toHaveBeenCalledTimes(2);
  });

  it('after activate/unlock, stores the new license and tells every listener', async () => {
    const heard: unknown[] = [];
    const unsubscribe = subscribeCompanyLicense((next) => heard.push(next));
    setCompanyLicense(NEWER);
    expect(heard).toEqual([NEWER]);
    await expect(loadCompanyLicense()).resolves.toEqual(NEWER);
    expect(licenseGet).not.toHaveBeenCalled();
    unsubscribe();
    setCompanyLicense(LICENSE);
    expect(heard).toEqual([NEWER]);
  });

  it('tells listeners when a request brings a newer license', async () => {
    const heard: unknown[] = [];
    subscribeCompanyLicense((next) => heard.push(next));
    await loadCompanyLicense();
    await Promise.resolve();
    expect(heard).toEqual([LICENSE]);
  });

  it('clearCompanyLicense makes the next read ask the server (after a plan payment)', async () => {
    await loadCompanyLicense();
    clearCompanyLicense();
    await loadCompanyLicense();
    expect(licenseGet).toHaveBeenCalledTimes(2);
  });
});
