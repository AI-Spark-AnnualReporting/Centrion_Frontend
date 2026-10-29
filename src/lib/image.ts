// Profile-photo intake: crop to 4:5 portrait, resize to 1000×1250, re-encode as
// JPEG under ~400 KB.
//
// The photo is held (and will be posted) as a base64 data URI, the way
// companies.logo_base64 already is — and base64 inflates by ~4/3. Handing a 5 MB
// phone photo straight through would mean ~6.8 MB of string per board member, so
// the resize is what makes the generous 5 MB input cap safe: whatever goes in,
// ~400 KB comes out.
//
// 4:5 is fixed here rather than at each render site so every future consumer —
// card avatar, report cover, email — gets the same framing.

import { dataUriBytes, formatBytes } from '@/types/brand';

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
export const PHOTO_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg';

export const PHOTO_WIDTH = 1000;
export const PHOTO_HEIGHT = 1250; // 4:5 portrait
export const PHOTO_TARGET_BYTES = 400 * 1024;
// PUT /team/{uid}/photo rejects anything over 1 MB decoded. The target above
// is what we aim for; this is the line that must not be crossed, so failing
// here gives a sentence about the image instead of a 422 from the server.
export const PHOTO_SERVER_MAX_BYTES = 1024 * 1024;

// Descending until the encode lands under PHOTO_TARGET_BYTES. A 1000×1250
// headshot is ~250 KB at 0.82, so the first step almost always wins; the tail is
// for busy images (crowds, foliage) that would otherwise blow the budget.
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.5, 0.4];

/** Why a picked photo is unusable, or null when it's fine.
 *
 * Synchronous like validateLogoFile: type and byte size are knowable without
 * decoding, so a rejection paints in the same tick as the pick.
 */
export function validatePhotoFile(f: File): string | null {
  if (!PHOTO_TYPES.includes(f.type))
    return 'That file type isn’t supported. Use a JPG or PNG.';
  if (f.size > PHOTO_MAX_BYTES)
    return `That image is ${formatBytes(f.size)} — the limit is 5 MB.`;
  return null;
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** The largest centred source rect matching targetW:targetH — i.e. what
 * `object-fit: cover` would show, computed so the crop happens once at upload
 * instead of differently in every container that renders the photo.
 *
 * Compares `srcW * targetH` against `srcH * targetW` rather than the two
 * ratios: integer maths, no float epsilon at exactly-4:5 inputs.
 */
export function coverCrop(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
): CropRect {
  if (srcW * targetH > srcH * targetW) {
    // Source is wider than the target box — trim the sides.
    const sw = (srcH * targetW) / targetH;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  // Source is taller (or equal) — trim top and bottom.
  const sh = (srcW * targetH) / targetW;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

function loadImage(f: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('We couldn’t read that image. Try another file.'));
    };
    img.src = url;
  });
}

/** Read an already-validated photo to a 1000×1250 JPEG data URI. */
export async function readProfilePhoto(f: File): Promise<string> {
  const img = await loadImage(f);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_WIDTH;
  canvas.height = PHOTO_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('We couldn’t process that image. Try another file.');
  ctx.imageSmoothingQuality = 'high';
  // A JPEG has no alpha; without this, a transparent PNG composites onto black.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);

  const { sx, sy, sw, sh } = coverCrop(
    img.naturalWidth,
    img.naturalHeight,
    PHOTO_WIDTH,
    PHOTO_HEIGHT,
  );
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);

  let out = '';
  for (const q of QUALITY_STEPS) {
    out = canvas.toDataURL('image/jpeg', q);
    if (dataUriBytes(out) <= PHOTO_TARGET_BYTES) return out;
  }
  // Past the last step the image is genuinely dense. The 400 KB target is a
  // budget and worth missing quietly; the server's 1 MB cap is not.
  if (dataUriBytes(out) > PHOTO_SERVER_MAX_BYTES) {
    throw new Error('We couldn’t compress that image enough. Try another photo.');
  }
  return out;
}
