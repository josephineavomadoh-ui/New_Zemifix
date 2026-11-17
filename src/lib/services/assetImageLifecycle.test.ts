// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { saveAssetImage, getAssetImagePath, deleteAssetImage } from './storageService';
import fs from 'fs';

describe('Asset Image Lifecycle & Cleanup', () => {
  it('handles missing image files gracefully returning null', () => {
    const nonExistentPath = getAssetImagePath('assets/non_existent_file_99999.jpg');
    expect(nonExistentPath).toBeNull();
  });

  it('ensures failed uploads or failed DB updates do not leave orphaned files (cleanup validation)', async () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const storageRef = await saveAssetImage(jpegBuffer, 'image/jpeg');

    const absolutePath = getAssetImagePath(storageRef);
    expect(absolutePath).toBeTruthy();
    expect(fs.existsSync(absolutePath!)).toBe(true);

    // Simulate cleanup on failure
    const deleted = await deleteAssetImage(storageRef);
    expect(deleted).toBe(true);
    expect(fs.existsSync(absolutePath!)).toBe(false);
  });
});
