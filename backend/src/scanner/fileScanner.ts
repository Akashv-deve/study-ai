import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { isIgnoredDirectory, isBinaryFile, isIgnoredFile } from './ignoreRules';
import { detectLanguage } from './languageDetector';
import { config } from '../config';

export interface ScannedFile {
  path: string;
  name: string;
  directory: string;
  extension: string;
  language: string;
  size: number;
  hash: string;
  isBinary: boolean;
  isAnalyzable: boolean;
  isAnalyzed: boolean;
  analysisStatus: 'analyzed' | 'skipped_binary' | 'skipped_file_size' | 'skipped_total_bytes' | 'skipped_analysis_limit';
  content?: string;
}

export interface ScanResult {
  files: ScannedFile[];
  languages: Record<string, number>;
  fileCount: number;
  analyzableFileCount: number;
  mainLanguage: string;
  limits: { reached: boolean; reasons: string[]; scannedFileCount: number; analyzedFileCount: number };
}

export async function scanDirectory(rootPath: string): Promise<ScanResult> {
  const files: ScannedFile[] = [];
  const languages: Record<string, number> = {};
  let totalBytesRead = 0;
  let analyzedFileCount = 0;
  const limitReasons = new Set<string>();

  async function walk(currentPath: string, depth = 0) {
    if (depth > config.MAX_RECURSION_DEPTH) {
      limitReasons.add('max_recursion_depth');
      return;
    }
    if (files.length >= config.MAX_SCANNED_FILES) {
      limitReasons.add('max_scanned_files');
      return;
    }

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (files.length >= config.MAX_SCANNED_FILES) { limitReasons.add('max_scanned_files'); break; }

        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          if (!isIgnoredDirectory(entry.name)) {
            await walk(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          if (isIgnoredFile(entry.name)) continue;

          const ext = path.extname(entry.name).replace(/^\./, '');
          const binary = isBinaryFile(ext);
          const lang = detectLanguage(ext, entry.name);
          const stats = await fs.stat(fullPath);

          let content: string | undefined;
          const analyzable = !binary && stats.size <= config.MAX_READABLE_FILE_SIZE;
          let analysisStatus: ScannedFile['analysisStatus'] = binary ? 'skipped_binary' : stats.size > config.MAX_READABLE_FILE_SIZE ? 'skipped_file_size' : 'skipped_total_bytes';

          if (analyzable && analyzedFileCount >= config.MAX_ANALYZED_FILES) {
            analysisStatus = 'skipped_analysis_limit';
            limitReasons.add('max_analyzed_files');
          } else if (analyzable && totalBytesRead + stats.size <= config.MAX_TOTAL_READABLE_BYTES) {
            try {
              content = await fs.readFile(fullPath, 'utf8');
              totalBytesRead += stats.size;
              analyzedFileCount++;
              analysisStatus = 'analyzed';
            } catch {
              analysisStatus = 'skipped_total_bytes';
            }
          } else if (analyzable) {
            limitReasons.add('max_total_readable_bytes');
          }

          const hash = crypto.createHash('sha256').update(content || relativePath).digest('hex');

          files.push({
            path: relativePath,
            name: entry.name,
            directory: path.dirname(relativePath).replace(/\\/g, '/'),
            extension: ext,
            language: lang,
            size: stats.size,
            hash,
            isBinary: binary,
            isAnalyzable: analyzable,
            isAnalyzed: analysisStatus === 'analyzed',
            analysisStatus,
            content,
          });

          if (lang !== 'Text') {
            languages[lang] = (languages[lang] || 0) + 1;
          }
        }
      }
    } catch (err) {
      console.error('Error walking directory:', currentPath, err);
    }
  }

  await walk(rootPath);

  let mainLanguage = 'Unknown';
  let maxCount = 0;
  for (const [lang, count] of Object.entries(languages)) {
    if (count > maxCount) {
      maxCount = count;
      mainLanguage = lang;
    }
  }

  return {
    files,
    languages,
    fileCount: files.length,
    analyzableFileCount: files.filter((f) => f.isAnalyzable).length,
    mainLanguage,
    limits: { reached: limitReasons.size > 0, reasons: [...limitReasons], scannedFileCount: files.length, analyzedFileCount },
  };
}
