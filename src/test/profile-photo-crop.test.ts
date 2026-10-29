// coverCrop decides the framing every board-member photo is stored with, and it
// runs once at upload — a wrong rect is baked into the saved JPEG, not something
// CSS can undo later. The canvas encode around it can't run under jsdom, so this
// pins the maths.

import { describe, it, expect } from 'vitest';
import {
  coverCrop,
  validatePhotoFile,
  PHOTO_WIDTH,
  PHOTO_HEIGHT,
  PHOTO_MAX_BYTES,
} from '@/lib/image';

const crop = (w: number, h: number) =>
  coverCrop(w, h, PHOTO_WIDTH, PHOTO_HEIGHT);

// A rect is "correct" when it is 4:5, centred, and fully inside the source.
function expectValidCrop(r: ReturnType<typeof crop>, srcW: number, srcH: number) {
  expect(r.sw / r.sh).toBeCloseTo(PHOTO_WIDTH / PHOTO_HEIGHT, 10);
  expect(r.sx).toBeCloseTo((srcW - r.sw) / 2, 10);
  expect(r.sy).toBeCloseTo((srcH - r.sh) / 2, 10);
  expect(r.sx).toBeGreaterThanOrEqual(0);
  expect(r.sy).toBeGreaterThanOrEqual(0);
  expect(r.sx + r.sw).toBeLessThanOrEqual(srcW + 1e-9);
  expect(r.sy + r.sh).toBeLessThanOrEqual(srcH + 1e-9);
}

describe('coverCrop — 4:5 portrait framing', () => {
  it('trims the sides of a landscape photo, keeping full height', () => {
    const r = crop(4000, 3000);
    expect(r.sh).toBe(3000);
    expect(r.sw).toBeCloseTo(2400, 10); // 3000 * 4/5
    expect(r.sx).toBeCloseTo(800, 10);
    expect(r.sy).toBe(0);
    expectValidCrop(r, 4000, 3000);
  });

  it('trims top and bottom of a portrait taller than 4:5, keeping full width', () => {
    const r = crop(3000, 4000);
    expect(r.sw).toBe(3000);
    expect(r.sh).toBeCloseTo(3750, 10); // 3000 * 5/4
    expect(r.sx).toBe(0);
    expect(r.sy).toBeCloseTo(125, 10);
    expectValidCrop(r, 3000, 4000);
  });

  it('takes the whole frame when the source is already 4:5', () => {
    const r = crop(1000, 1250);
    expect(r).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 1250 });
  });

  it('trims the sides of a square source, since 4:5 is narrower than 1:1', () => {
    const r = crop(2000, 2000);
    expect(r.sh).toBe(2000);
    expect(r.sw).toBeCloseTo(1600, 10); // 2000 * 4/5
    expect(r.sx).toBeCloseTo(200, 10);
    expectValidCrop(r, 2000, 2000);
  });

  it('never returns a rect outside the source, across many shapes', () => {
    for (const [w, h] of [
      [640, 480], [480, 640], [1920, 1080], [1080, 1920],
      [200, 1000], [1000, 200], [1001, 1249], [999, 1251],
    ]) {
      expectValidCrop(crop(w, h), w, h);
    }
  });
});

describe('validatePhotoFile', () => {
  const file = (type: string, size: number) =>
    ({ type, size, name: 'x' }) as File;

  it('accepts a JPG and a PNG under the cap', () => {
    expect(validatePhotoFile(file('image/jpeg', 4_000_000))).toBeNull();
    expect(validatePhotoFile(file('image/png', 10))).toBeNull();
  });

  it('rejects a non-image type', () => {
    expect(validatePhotoFile(file('application/pdf', 10))).toMatch(/JPG or PNG/);
  });

  it('rejects anything over 5 MB', () => {
    expect(validatePhotoFile(file('image/jpeg', PHOTO_MAX_BYTES + 1))).toMatch(
      /limit is 5 MB/,
    );
    expect(validatePhotoFile(file('image/jpeg', PHOTO_MAX_BYTES))).toBeNull();
  });
});
