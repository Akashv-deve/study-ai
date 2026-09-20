import { Request, Response, NextFunction } from 'express';
import { projectRepository } from '../repositories/project.repository';
import { jobRepository } from '../repositories/job.repository';
import { NotFoundError, ValidationError } from '../utils/errors';
import crypto from 'crypto';
import fs from 'fs/promises';
import { storeProjectArchive, deleteProjectArchive } from '../storage/gridfs';
import { ProcessingJob } from '../models/processingJob.model';
import { validateZipFile } from '../utils/zip';
import { config } from '../config';

export async function createProject(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { name, description } = req.body;

    if (!name) throw new ValidationError('Project name is required');

    const project = await projectRepository.create({
      userId,
      name,
      description,
      sourceType: 'zip',
      processingStatus: 'queued',
    });

    res.status(201).json({ data: project });
  } catch (err) {
    next(err);
  }
}

export async function listProjects(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const projects = await projectRepository.findByUserId(userId);
    res.json({ data: projects });
  } catch (err) {
    next(err);
  }
}

export async function getProject(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await projectRepository.findOwnedById(String(req.params.id), req.user!.id);
    if (!project) throw new NotFoundError('Project not found');
    res.json({ data: project });
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const jobs = await ProcessingJob.find({ projectId: String(req.params.id), userId }).lean();
    const deleted = await projectRepository.delete(String(req.params.id), userId);
    if (!deleted) throw new NotFoundError('Project not found');
    await Promise.all(jobs.map((job) => deleteProjectArchive(job.metadata?.archiveId as string | undefined).catch(() => undefined)));
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
}

export async function renameProject(req: Request, res: Response, next: NextFunction) {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 120) throw new ValidationError('Project name must be between 1 and 120 characters');
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : undefined;
    const project = await projectRepository.updateOwned(String(req.params.id), req.user!.id, { name, description });
    if (!project) throw new NotFoundError('Project not found');
    res.json({ data: project });
  } catch (err) {
    next(err);
  }
}

export async function uploadZip(req: Request, res: Response, next: NextFunction) {
  let projectId: string | undefined;
  let archiveId: string | undefined;
  try {
    const userId = req.user!.id;
    if (!req.file) throw new ValidationError('No file uploaded');
    const validation = validateZipFile(req.file.path, {
      maxCompressedBytes: config.MAX_UPLOAD_BYTES,
      maxUncompressedSize: config.MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES,
      maxEntryUncompressedSize: config.MAX_ZIP_ENTRY_BYTES,
    });
    if (!validation.valid) throw new ValidationError(validation.error || 'Invalid ZIP archive');

    const { name, description } = req.body;
    const projectName = name || req.file.originalname.replace(/\.zip$/i, '');

    const project = await projectRepository.create({
      userId,
      name: projectName,
      description,
      sourceType: 'zip',
      processingStatus: 'queued',
    });
    projectId = String(project._id);

    const jobId = 'job_' + crypto.randomBytes(8).toString('hex');

    archiveId = await storeProjectArchive(req.file.path, req.file.originalname, userId, projectId);
    await fs.unlink(req.file.path).catch(() => undefined);
    const job = await jobRepository.create({
      jobId,
      projectId: project._id as any,
      userId,
      status: 'queued',
      stage: 'Queued for processing',
      progress: 0,
      metadata: { archiveId, originalName: req.file.originalname },
    });

    await projectRepository.updateStatus(String(project._id), 'queued', jobId);

    res.status(202).json({
      data: {
        projectId: project._id,
        jobId,
        status: job.status,
      },
    });
  } catch (err) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => undefined);
    await deleteProjectArchive(archiveId).catch(() => undefined);
    if (projectId) await projectRepository.delete(projectId, req.user!.id).catch(() => undefined);
    next(err);
  }
}

export async function retryJob(req: Request, res: Response, next: NextFunction) {
  try {
    const claimedJob = await jobRepository.beginRetry(String(req.params.jobId), req.user!.id);
    if (!claimedJob) throw new NotFoundError('Failed job not found');
    const cleared = await projectRepository.clearPartialIndex(String(claimedJob.projectId), req.user!.id);
    if (!cleared) throw new NotFoundError('Project not found');
    const job = await jobRepository.queueRetry(String(req.params.jobId), req.user!.id);
    if (!job) throw new NotFoundError('Retry could not be queued');
    await projectRepository.updateStatus(String(job.projectId), 'queued', job.jobId);
    res.status(202).json({ data: job });
  } catch (err) {
    next(err);
  }
}

export async function getJobStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const job = await jobRepository.findOwnedByJobId(String(req.params.jobId), req.user!.id);
    if (!job) throw new NotFoundError('Job not found');
    res.json({ data: job });
  } catch (err) {
    next(err);
  }
}
