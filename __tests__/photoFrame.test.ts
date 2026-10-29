/**
 * How tall a timeline photograph is drawn (fix round 0.2.1, F4): its own
 * shape, the full width, never cropped, and capped at part of the window.
 */

import { PHOTO_HEIGHT_SHARE, PLACEHOLDER_RATIO, photoFrame } from '../src/layout/photoFrame';

describe('photoFrame', () => {
  it('follows a landscape picture’s own shape', () => {
    expect(photoFrame(360, { width: 3000, height: 2000 }, 800)).toEqual({
      height: 240,
      letterboxed: false,
    });
  });

  it('follows a portrait picture’s own shape while it fits', () => {
    expect(photoFrame(300, { width: 2000, height: 3000 }, 800)).toEqual({
      height: 450,
      letterboxed: false,
    });
  });

  it('caps a picture taller than the cap, and letterboxes it', () => {
    const frame = photoFrame(360, { width: 2000, height: 3000 }, 600);
    expect(frame).toEqual({ height: Math.round(600 * PHOTO_HEIGHT_SHARE), letterboxed: true });
  });

  it('caps on a wide display too, where a portrait shot would be enormous', () => {
    expect(photoFrame(840, { width: 1536, height: 2048 }, 960)).toEqual({
      height: Math.round(960 * PHOTO_HEIGHT_SHARE),
      letterboxed: true,
    });
  });

  it('uses a placeholder shape until the picture has said its size', () => {
    expect(photoFrame(400, null, 900)).toEqual({ height: 400 * PLACEHOLDER_RATIO, letterboxed: false });
    expect(photoFrame(400, { width: 0, height: 0 }, 900)).toEqual({
      height: 400 * PLACEHOLDER_RATIO,
      letterboxed: false,
    });
  });

  it('has nothing to say before the frame has a width', () => {
    expect(photoFrame(0, { width: 3000, height: 2000 }, 800)).toBeNull();
    expect(photoFrame(Number.NaN, null, 800)).toBeNull();
  });

  it('caps at about 70% of the window', () => {
    expect(PHOTO_HEIGHT_SHARE).toBe(0.7);
  });
});
