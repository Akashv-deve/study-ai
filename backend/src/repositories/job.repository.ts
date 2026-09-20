import { ProcessingJob, IProcessingJob } from '../models/processingJob.model';
import crypto from 'crypto';

const ACTIVE_STATUSES = ['uploading', 'extracting', 'scanning', 'indexing'] as const;

export class JobRepository {
  async create(data: Partial<IProcessingJob>): Promise<IProcessingJob> {
    return await ProcessingJob.create(data);
  }

  async findByJobId(jobId: string): Promise<IProcessingJob | null> {
    return await ProcessingJob.findOne({ jobId });
  }

  async findOwnedByJobId(jobId: string, userId: string): Promise<IProcessingJob | null> {
    return ProcessingJob.findOne({ jobId, userId });
  }

  async beginRetry(jobId: string, userId: string): Promise<IProcessingJob | null> {
    return ProcessingJob.findOneAndUpdate(
      { jobId, userId, status: 'failed' },
      { status: 'indexing', stage: 'Preparing retry', progress: 0, $unset: { error: 1, completedAt: 1 } },
      { new: true }
    );
  }

  async queueRetry(jobId: string, userId: string): Promise<IProcessingJob | null> {
    return ProcessingJob.findOneAndUpdate(
      { jobId, userId, status: 'indexing', stage: 'Preparing retry' },
      { status: 'queued', stage: 'Queued for retry', progress: 0, $unset: { leaseId: 1 } },
      { new: true }
    );
  }

  async findStale(staleBefore: Date): Promise<IProcessingJob[]> {
    return ProcessingJob.find({ status: { $in: ACTIVE_STATUSES }, updatedAt: { $lt: staleBefore } });
  }

  async claimStale(jobId: string, staleBefore: Date): Promise<IProcessingJob | null> {
    return ProcessingJob.findOneAndUpdate(
      { jobId, status: { $in: ACTIVE_STATUSES }, updatedAt: { $lt: staleBefore } },
      { status: 'indexing', stage: 'Recovering interrupted processing', progress: 0, leaseId: crypto.randomUUID(), $unset: { error: 1, completedAt: 1 } },
      { new: true }
    );
  }

  async queueRecovered(jobId: string, userId: string, leaseId: string): Promise<IProcessingJob | null> {
    return ProcessingJob.findOneAndUpdate(
      { jobId, userId, status: 'indexing', stage: 'Recovering interrupted processing', leaseId },
      { status: 'queued', stage: 'Recovered after interrupted processing', progress: 0, $unset: { leaseId: 1 } },
      { new: true }
    );
  }

  async cancelForProject(projectId: string, userId: string): Promise<IProcessingJob[]> {
    const active = ['queued', 'uploading', 'extracting', 'scanning', 'indexing'];
    await ProcessingJob.updateMany({ projectId, userId, status: { $in: active } }, { status: 'cancelled', stage: 'Project deleted', completedAt: new Date() });
    return ProcessingJob.find({ projectId, userId });
  }

  async deleteForProject(projectId: string, userId: string): Promise<void> {
    await ProcessingJob.deleteMany({ projectId, userId });
  }

  async findNextQueuedJob(): Promise<IProcessingJob | null> {
    return await ProcessingJob.findOneAndUpdate(
      { status: 'queued' },
      { status: 'uploading', stage: 'Initializing', leaseId: crypto.randomUUID() },
      { sort: { createdAt: 1 }, new: true }
    );
  }

  async updateProgress(jobId: string, status: IProcessingJob['status'], stage: string, progress: number, error?: string, leaseId?: string): Promise<IProcessingJob | null> {
    return await ProcessingJob.findOneAndUpdate(
      { jobId, ...(leaseId ? { leaseId } : {}) },
      { status, stage, progress, ...(error ? { error } : {}), ...(status === 'ready' || status === 'failed' ? { completedAt: new Date() } : {}) },
      { new: true }
    );
  }

  async hasLease(jobId: string, leaseId?: string): Promise<boolean> {
    if (!leaseId) return false;
    return Boolean(await ProcessingJob.exists({ jobId, leaseId, status: { $in: ACTIVE_STATUSES } }));
  }
}

export const jobRepository = new JobRepository();
