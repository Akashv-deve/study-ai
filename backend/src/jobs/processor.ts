import { jobRepository } from '../repositories/job.repository';
import { projectRepository } from '../repositories/project.repository';
import { scanDirectory } from '../scanner/fileScanner';
import { ProjectFile } from '../models/projectFile.model';
import { FileContent } from '../models/fileContent.model';
import { validateZipFile } from '../utils/zip';
import AdmZip from 'adm-zip';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { restoreProjectArchive, deleteProjectArchive } from '../storage/gridfs';
import { Project } from '../models/project.model';
import { ProcessingJob } from '../models/processingJob.model';
import { config } from '../config';
import mongoose from 'mongoose';
import crypto from 'crypto';

let isProcessing = false;
let intervalId: NodeJS.Timeout | null = null;
const STALE_JOB_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVE_JOB_STATUSES = ['uploading', 'extracting', 'scanning', 'indexing'];

interface IndexedFile {
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

/**
 * Make a file/content write atomic with lease renewal. Lease rotation or job
 * cancellation conflicts with this transaction, so an interrupted worker
 * cannot add orphaned child data after recovery or deletion begins.
 */
async function persistIndexedFile(job: { jobId: string; leaseId?: string; projectId: unknown; userId: string }, file: IndexedFile): Promise<boolean> {
  if (!job.leaseId) return false;
  const session = await mongoose.startSession();
  let persisted = false;
  try {
    await session.withTransaction(async () => {
      const activeJob = await ProcessingJob.findOneAndUpdate(
        { jobId: job.jobId, leaseId: job.leaseId, status: { $in: ACTIVE_JOB_STATUSES } },
        { $set: { updatedAt: new Date() } },
        { new: true, session }
      );
      if (!activeJob || !await Project.exists({ _id: job.projectId, userId: job.userId }).session(session)) return;

      await ProjectFile.create([{
        projectId: job.projectId, path: file.path, name: file.name, directory: file.directory,
        extension: file.extension, language: file.language, size: file.size, hash: file.hash,
        isBinary: file.isBinary, isAnalyzable: file.isAnalyzable, isAnalyzed: file.isAnalyzed,
        analysisStatus: file.analysisStatus,
      }], { session });
      if (file.isAnalyzed && file.content !== undefined) {
        await FileContent.create([{ projectId: job.projectId, filePath: file.path, content: file.content, hash: file.hash, size: file.size }], { session });
      }
      persisted = true;
    });
    return persisted;
  } finally {
    await session.endSession();
  }
}

export function startJobProcessor() {
  console.log('Background job processor started.');
  void recoverStaleJobs().catch((error) => console.error('Stale job recovery failed:', error)).finally(processJobs);
  intervalId = setInterval(processJobs, 3000);
}

async function recoverStaleJobs(): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_JOB_TIMEOUT_MS);
  const staleJobs = await jobRepository.findStale(staleBefore);
  let recoveredCount = 0;
  for (const staleJob of staleJobs) {
    // Rotate the lease before cleanup, which prevents the interrupted worker
    // from writing any more records if it resumes late.
    const job = await jobRepository.claimStale(staleJob.jobId, staleBefore);
    if (!job || !job.leaseId) continue;
    // A stale process may have written part of the index before crashing. Clear
    // only project-file data, preserving user conversations and AI results.
    const cleared = await projectRepository.clearPartialIndex(String(job.projectId), job.userId);
    if (!cleared) {
      await jobRepository.updateProgress(job.jobId, 'cancelled', 'Project no longer exists', 0);
      continue;
    }
    if (await jobRepository.queueRecovered(job.jobId, job.userId, job.leaseId)) recoveredCount++;
  }
  if (recoveredCount) console.log(`Recovered ${recoveredCount} stale processing job(s).`);
}

export function stopJobProcessor() {
  if (intervalId) clearInterval(intervalId);
  console.log('Background job processor stopped.');
}

async function processJobs() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const job = await jobRepository.findNextQueuedJob();
    if (!job) {
      isProcessing = false;
      return;
    }

    console.log(`Processing job ${job.jobId} for project ${job.projectId}...`);

    const workId = job.leaseId || crypto.randomUUID();
    const tempExtractDir = path.join(os.tmpdir(), `study-ai-extract-${job.jobId}-${workId}`);
    const archiveId = job.metadata?.archiveId as string | undefined;
    const zipPath = path.join(os.tmpdir(), `study-ai-archive-${job.jobId}-${workId}.zip`);

    try {
      const projectExists = await Project.exists({ _id: job.projectId, userId: job.userId });
      if (!projectExists || job.status === 'cancelled') {
        await jobRepository.updateProgress(job.jobId, 'cancelled', 'Project no longer exists', 0, undefined, job.leaseId);
        return;
      }
      if (archiveId) {
        // Validate ZIP
        await jobRepository.updateProgress(job.jobId, 'extracting', 'Validating ZIP archive', 10, undefined, job.leaseId);
        await restoreProjectArchive(archiveId, zipPath);
        const validation = validateZipFile(zipPath, {
          maxCompressedBytes: config.MAX_UPLOAD_BYTES,
          maxUncompressedSize: config.MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES,
          maxEntryUncompressedSize: config.MAX_ZIP_ENTRY_BYTES,
        });
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        // Extract
        await jobRepository.updateProgress(job.jobId, 'extracting', 'Extracting files', 25, undefined, job.leaseId);
        const zip = new AdmZip(zipPath);
        const extractionRoot = path.resolve(tempExtractDir);
        await fs.mkdir(extractionRoot, { recursive: true });
        for (const entry of zip.getEntries()) {
          const target = path.resolve(extractionRoot, entry.entryName);
          if (target !== extractionRoot && !target.startsWith(`${extractionRoot}${path.sep}`)) {
            throw new Error(`ZIP entry escapes extraction directory: ${entry.entryName}`);
          }
          if (entry.isDirectory) {
            await fs.mkdir(target, { recursive: true });
          } else {
            await fs.mkdir(path.dirname(target), { recursive: true });
            // Validation caps every uncompressed entry, keeping this unavoidable
            // AdmZip buffer allocation bounded to a practical size.
            const data = entry.getData();
            await fs.writeFile(target, data, { flag: 'wx' });
          }
        }
      } else {
        throw new Error('Processing job has no durable archive reference');
      }

      // Scan
      await jobRepository.updateProgress(job.jobId, 'scanning', 'Scanning project directory', 50, undefined, job.leaseId);
      const scanResult = await scanDirectory(tempExtractDir);

      // Indexing
      await jobRepository.updateProgress(job.jobId, 'indexing', 'Indexing source files into MongoDB', 75, undefined, job.leaseId);

      for (const file of scanResult.files) {
        if (!await persistIndexedFile(job, file)) {
          console.warn(`Stopping stale or cancelled worker for job ${job.jobId}.`);
          return;
        }
      }

      // Update project stats
      if (!await jobRepository.hasLease(job.jobId, job.leaseId)) {
        console.warn(`Stopping stale worker for job ${job.jobId} before project finalization.`);
        return;
      }
      const project = await projectRepository.findOwnedById(String(job.projectId), job.userId);
      if (project) {
        project.languages = Object.keys(scanResult.languages);
        project.fileCount = scanResult.fileCount;
        // This field is surfaced to the UI; report files actually indexed for AI,
        // not merely files that would have been eligible without configured caps.
        project.analyzableFileCount = scanResult.limits.analyzedFileCount;
        project.mainLanguage = scanResult.mainLanguage;
        project.scanLimits = scanResult.limits;
        project.processingStatus = 'ready';
        await project.save();
      }

      await jobRepository.updateProgress(job.jobId, 'ready', 'Project ready', 100, undefined, job.leaseId);
      await deleteProjectArchive(archiveId).catch((error) => {
        console.warn(`Unable to remove processed archive for ${job.jobId}:`, error);
      });
      console.log(`Job ${job.jobId} completed successfully.`);
    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error(`Job ${job.jobId} failed:`, errorMsg);
      if (await jobRepository.hasLease(job.jobId, job.leaseId)) {
        await jobRepository.updateProgress(job.jobId, 'failed', 'Processing failed', 0, errorMsg, job.leaseId);
        await projectRepository.updateStatus(String(job.projectId), 'failed');
      }
    } finally {
      // Cleanup temp files
      try {
        await fs.unlink(zipPath).catch(() => {});
        await fs.rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});
      } catch {}
    }
  } catch (err) {
    console.error('Job loop error:', err);
  } finally {
    isProcessing = false;
  }
}
