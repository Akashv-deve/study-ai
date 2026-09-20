import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

export interface ZipValidationStats {
  entries: number;
  uncompressedSize: number;
}

export interface ZipValidationResult {
  valid: boolean;
  error?: string;
  stats?: ZipValidationStats;
}

export interface ZipValidationOptions {
  maxCompressedBytes?: number;
  maxEntries?: number;
  maxUncompressedSize?: number;
  maxEntryUncompressedSize?: number;
}

export function validateZipFile(
  filePath: string,
  options: ZipValidationOptions = {}
): ZipValidationResult {
  try {
    const maxCompressedBytes = options.maxCompressedBytes ?? 104857600;
    const maxEntries = options.maxEntries ?? 10000;
    const maxUncompressedSize = options.maxUncompressedSize ?? 314572800;
    const maxEntryUncompressedSize = options.maxEntryUncompressedSize ?? 10485760;
    if (fs.statSync(filePath).size > maxCompressedBytes) return { valid: false, error: `Compressed ZIP size exceeds maximum limit of ${maxCompressedBytes} bytes` };
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    if (entries.length > maxEntries) {
      return { valid: false, error: `ZIP entry count (${entries.length}) exceeds maximum limit of ${maxEntries}` };
    }

    let totalUncompressedSize = 0;

    for (const entry of entries) {
      const entryPath = entry.entryName;

      const normalized = entryPath.replace(/\\/g, '/');
      // Reject traversal segments and paths that could resolve outside the extraction root
      // on either Windows or Linux. A filename containing two dots remains valid.
      if (normalized.split('/').includes('..') || path.posix.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) {
        return { valid: false, error: `Zip Slip security violation detected in entry: ${entryPath}` };
      }

      if (!Number.isSafeInteger(entry.header.size) || entry.header.size < 0 || entry.header.size > maxEntryUncompressedSize) {
        return { valid: false, error: `ZIP entry exceeds per-entry limit: ${entryPath}` };
      }

      totalUncompressedSize += entry.header.size;

      if (totalUncompressedSize > maxUncompressedSize) {
        return { valid: false, error: `Total uncompressed size exceeds maximum limit of ${maxUncompressedSize} bytes` };
      }
    }

    return {
      valid: true,
      stats: {
        entries: entries.length,
        uncompressedSize: totalUncompressedSize,
      },
    };
  } catch (err) {
    return { valid: false, error: `Invalid or corrupt ZIP archive: ${(err as Error).message}` };
  }
}
