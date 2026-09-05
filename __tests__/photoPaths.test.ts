import {
  ALLOWED_PHOTO_EXTENSIONS,
  MAX_PHOTO_SEQUENCE,
  PHOTO_ROOT,
  buildPhotoLogicalPath,
  cookEventIdFromPhotoPath,
  cookIdFromPhotoPath,
  isSafePhotoLogicalPath,
  normalisePhotoExtension,
} from '../src/data/photos/photoPaths';
import type { PhotoPathInput } from '../src/data/photos/photoPaths';
import { SYNTHETIC_PHOTO_PATH } from './fixtures/syntheticData';

/** `Required` so a test may override `cookEventId` with `null`. */
type PathOverrides = Partial<Required<PhotoPathInput>>;

const BASE: Required<PhotoPathInput> = {
  cookId: 'cook-01',
  cookEventId: 'event-01',
  capturedAt: '2026-09-05T18:31:00.000Z',
  sequence: 1,
  extension: 'jpg',
};

function pathFor(overrides: PathOverrides = {}): string {
  const result = buildPhotoLogicalPath({ ...BASE, ...overrides });
  if (!result.ok) {
    throw new Error(`expected a path, got ${result.reason}`);
  }
  return result.path;
}

function rejectionFor(overrides: PathOverrides): string {
  const result = buildPhotoLogicalPath({ ...BASE, ...overrides });
  if (result.ok) {
    throw new Error(`expected a rejection, got ${result.path}`);
  }
  return result.reason;
}

describe('building a photo path', () => {
  it('derives the path from the cook and the event', () => {
    expect(pathFor()).toBe(`${PHOTO_ROOT}/cook-01/events/event-01/20260905t183100-01.jpg`);
  });

  it('files a cook-level photo under the cook alone', () => {
    expect(pathFor({ cookEventId: null })).toBe(
      `${PHOTO_ROOT}/cook-01/20260905t183100-01.jpg`,
    );
  });

  it('is deterministic', () => {
    expect(pathFor()).toBe(pathFor());
  });

  it('separates photos captured in the same second', () => {
    expect(pathFor({ sequence: 2 })).not.toBe(pathFor({ sequence: 1 }));
    expect(pathFor({ sequence: 12 })).toContain('-12.jpg');
  });

  it('normalises the extension rather than guessing at it', () => {
    expect(pathFor({ extension: 'JPEG' })).toContain('.jpg');
    expect(pathFor({ extension: '.PNG' })).toContain('.png');
    expect(normalisePhotoExtension('gif')).toBeNull();
    expect(normalisePhotoExtension('jpg.exe')).toBeNull();
  });

  it('stores only the image types the app understands', () => {
    for (const extension of ALLOWED_PHOTO_EXTENSIONS) {
      expect(pathFor({ extension })).toContain(`.${extension}`);
    }
  });

  it('refuses anything it cannot derive a safe path from', () => {
    expect(rejectionFor({ cookId: '../../etc' })).toBe('invalid_cook_id');
    expect(rejectionFor({ cookId: 'Cook 01' })).toBe('invalid_cook_id');
    expect(rejectionFor({ cookEventId: '..' })).toBe('invalid_cook_event_id');
    expect(rejectionFor({ capturedAt: 'yesterday' })).toBe('invalid_timestamp');
    expect(rejectionFor({ sequence: -1 })).toBe('invalid_sequence');
    expect(rejectionFor({ sequence: MAX_PHOTO_SEQUENCE + 1 })).toBe('invalid_sequence');
    expect(rejectionFor({ sequence: 1.5 })).toBe('invalid_sequence');
    expect(rejectionFor({ extension: 'exe' })).toBe('unsupported_extension');
  });

  it('produces paths that pass the safety check', () => {
    expect(isSafePhotoLogicalPath(pathFor())).toBe(true);
    expect(isSafePhotoLogicalPath(pathFor({ cookEventId: null }))).toBe(true);
  });
});

describe('recognising a safe path', () => {
  it('accepts the fixture path', () => {
    expect(isSafePhotoLogicalPath(SYNTHETIC_PHOTO_PATH)).toBe(true);
  });

  it.each([
    ['an absolute POSIX path', '/data/data/com.cookinglab/files/photo.jpg'],
    ['a Windows path', 'C:\\photos\\photo.jpg'],
    ['a UNC path', '\\\\server\\share\\photo.jpg'],
    ['parent traversal', 'cooks/cook-01/../../secrets.jpg'],
    ['a bare traversal', '../photo.jpg'],
    ['an https URL', 'https://example.com/cooks/cook-01/20260905t183100-01.jpg'],
    ['a file URL', 'file:///var/mobile/photo.jpg'],
    ['a content URI', 'content://media/external/images/1'],
    ['a cache directory', 'cache/cook-01/20260905t183100-01.jpg'],
    ['a temp directory', 'tmp/20260905t183100-01.jpg'],
    ['a path outside the photo root', 'documents/cook-01/20260905t183100-01.jpg'],
    ['a doubled separator', 'cooks//cook-01/20260905t183100-01.jpg'],
    ['whitespace', 'cooks/cook-01/2026 0905t183100-01.jpg'],
    ['an unexpected extension', 'cooks/cook-01/20260905t183100-01.gif'],
    ['an executable disguised as a photo', 'cooks/cook-01/20260905t183100-01.jpg.exe'],
    ['an uppercase id', 'cooks/Cook-01/20260905t183100-01.jpg'],
    ['a free-text filename', 'cooks/cook-01/my holiday photo.jpg'],
    ['an empty string', ''],
  ])('rejects %s', (_description, candidate) => {
    expect(isSafePhotoLogicalPath(candidate)).toBe(false);
  });

  it('rejects anything that is not a string', () => {
    expect(isSafePhotoLogicalPath(null)).toBe(false);
    expect(isSafePhotoLogicalPath(undefined)).toBe(false);
    expect(isSafePhotoLogicalPath(42)).toBe(false);
  });
});

describe('reading a path back', () => {
  it('recovers the cook and the event a photo belongs to', () => {
    expect(cookIdFromPhotoPath(SYNTHETIC_PHOTO_PATH)).toBe('synthetic-cook-sourdough-01');
    expect(cookEventIdFromPhotoPath(SYNTHETIC_PHOTO_PATH)).toBe('synthetic-event-crumb-photo');
  });

  it('reports no event for a cook-level photo', () => {
    const path = pathFor({ cookEventId: null });

    expect(cookIdFromPhotoPath(path)).toBe('cook-01');
    expect(cookEventIdFromPhotoPath(path)).toBeNull();
  });

  it('refuses to read anything out of an unsafe path', () => {
    expect(cookIdFromPhotoPath('https://example.com/cooks/cook-01/x.jpg')).toBeNull();
    expect(cookEventIdFromPhotoPath('../cooks/cook-01/x.jpg')).toBeNull();
  });
});
