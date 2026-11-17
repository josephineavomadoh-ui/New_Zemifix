import fs from 'fs';
import path from 'path';
import { generateUuidV7 } from '../uuid';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function getStorageRoot(): string {
  const customRoot = process.env.STORAGE_ROOT;
  if (customRoot) {
    return path.resolve(customRoot);
  }
  return path.join(process.cwd(), 'storage', 'uploads', 'assets');
}

/**
 * Validates file magic bytes to ensure true content type, not just extension/MIME header.
 */
function validateImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }

  // WebP: RIFF ... WEBP (Bytes 0-3 'RIFF', Bytes 8-11 'WEBP')
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return true;
  }

  return false;
}

function getExtensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

/**
 * Saves an asset image buffer to persistent storage outside public root.
 * Returns an internal storage reference string (e.g. "assets/asset_<id>_<rand>.jpg").
 */
export async function saveAssetImage(fileBuffer: Buffer, mimeType: string): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error('INVALID_FILE_TYPE: Only JPEG, PNG, and WebP images are permitted.');
  }

  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error('FILE_TOO_LARGE: Asset photograph exceeds the 5 MB size limit.');
  }

  if (!validateImageMagicBytes(fileBuffer)) {
    throw new Error('INVALID_FILE_CONTENT: File content does not match verified image signatures.');
  }

  const storageRoot = getStorageRoot();
  if (!fs.existsSync(storageRoot)) {
    fs.mkdirSync(storageRoot, { recursive: true });
  }

  const ext = getExtensionFromMime(mimeType);
  const uniqueFilename = `asset_${generateUuidV7()}_${Date.now()}.${ext}`;
  const absolutePath = path.resolve(storageRoot, uniqueFilename);

  // Prevent path traversal
  if (!absolutePath.startsWith(path.resolve(storageRoot))) {
    throw new Error('SECURITY_VIOLATION: Path traversal detected.');
  }

  await fs.promises.writeFile(absolutePath, fileBuffer);

  // Return internal storage reference (never absolute filesystem path or public URL)
  return `assets/${uniqueFilename}`;
}

/**
 * Resolves an internal storage reference to an absolute filesystem path securely.
 */
export function getAssetImagePath(storageRef: string): string | null {
  if (!storageRef || typeof storageRef !== 'string') return null;

  // Ensure storageRef starts with "assets/" and contains no path traversal sequences
  const sanitizedRef = storageRef.replace(/^(\.\.[\/\\])+/, '');
  const storageRoot = getStorageRoot();
  const absolutePath = path.resolve(storageRoot, path.basename(sanitizedRef));

  if (!absolutePath.startsWith(path.resolve(storageRoot))) {
    return null;
  }

  if (fs.existsSync(absolutePath)) {
    return absolutePath;
  }

  return null;
}

/**
 * Safely deletes a stored asset image file given its internal storage reference.
 */
export async function deleteAssetImage(storageRef: string): Promise<boolean> {
  try {
    const absolutePath = getAssetImagePath(storageRef);
    if (absolutePath && fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath);
      return true;
    }
  } catch (err) {
    console.error('[StorageService] Error deleting asset image file:', err);
  }
  return false;
}
