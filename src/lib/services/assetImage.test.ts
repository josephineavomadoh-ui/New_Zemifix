// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { saveAssetImage, getAssetImagePath, deleteAssetImage } from './storageService';

describe('Asset Image Storage Service', () => {
  it('rejects unsupported MIME types', async () => {
    const fakeBuffer = Buffer.from('text file content');
    await expect(saveAssetImage(fakeBuffer, 'text/plain')).rejects.toThrow('INVALID_FILE_TYPE');
  });

  it('rejects oversized files (> 5MB)', async () => {
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024);
    await expect(saveAssetImage(largeBuffer, 'image/jpeg')).rejects.toThrow('FILE_TOO_LARGE');
  });

  it('rejects files with invalid magic bytes', async () => {
    const fakeImageBuffer = Buffer.from('not a real image header data');
    await expect(saveAssetImage(fakeImageBuffer, 'image/jpeg')).rejects.toThrow('INVALID_FILE_CONTENT');
  });

  it('successfully validates and saves a valid JPEG buffer', async () => {
    // JPEG magic bytes: FF D8 FF
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const storageRef = await saveAssetImage(jpegBuffer, 'image/jpeg');
    expect(storageRef).toMatch(/^assets\/asset_.*\.jpg$/);

    const absolutePath = getAssetImagePath(storageRef);
    expect(absolutePath).toBeDefined();

    const deleted = await deleteAssetImage(storageRef);
    expect(deleted).toBe(true);
  });

  it('successfully validates and saves a valid PNG buffer', async () => {
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const storageRef = await saveAssetImage(pngBuffer, 'image/png');
    expect(storageRef).toMatch(/^assets\/asset_.*\.png$/);

    const deleted = await deleteAssetImage(storageRef);
    expect(deleted).toBe(true);
  });

  it('successfully validates and saves a valid WebP buffer', async () => {
    // WebP magic bytes: RIFF ... WEBP
    const webpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x00, 0x00, 0x00, 0x00,
    ]);
    const storageRef = await saveAssetImage(webpBuffer, 'image/webp');
    expect(storageRef).toMatch(/^assets\/asset_.*\.webp$/);

    const deleted = await deleteAssetImage(storageRef);
    expect(deleted).toBe(true);
  });

  it('prevents path traversal attacks in getAssetImagePath', () => {
    const maliciousRef = 'assets/../../etc/passwd';
    const resolvedPath = getAssetImagePath(maliciousRef);
    expect(resolvedPath).toBeNull();
  });
});
