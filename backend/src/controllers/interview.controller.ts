import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { projectRepository } from '../repositories/project.repository';
import { NotFoundError, ValidationError } from '../utils/errors';
import { getProjectPracticeContext } from '../practice/projectContext';
import * as interviewService from '../practice/interviewService';
import { PRACTICE_TECHNOLOGIES } from '../models/practiceChallenge.model';
import { toSafeInterview } from '../models/interviewSession.model';

const MAX_ANSWER_LENGTH = 4000;

async function requireOwnedProjectIfGiven(projectId: string | undefined, userId: string) {
  if (!projectId) return undefined;
  if (!mongoose.isValidObjectId(projectId)) throw new ValidationError('Invalid project id');
  const project = await projectRepository.findOwnedById(projectId, userId);
  if (!project) throw new NotFoundError('Project not found');
  return project;
}

export async function startInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { technology, projectId } = req.body as { technology?: unknown; projectId?: unknown };
    const tech = typeof technology === 'string' ? technology : undefined;
    const pid = typeof projectId === 'string' ? projectId : undefined;
    if (!tech && !pid) throw new ValidationError('A technology or project is required to start an interview');
    if (tech && !PRACTICE_TECHNOLOGIES.includes(tech as (typeof PRACTICE_TECHNOLOGIES)[number])) throw new ValidationError('Invalid technology');
    const project = await requireOwnedProjectIfGiven(pid, userId);
    const projectContext = project ? await getProjectPracticeContext(project, userId) : undefined;
    const session = await interviewService.startInterview(userId, { technology: tech, projectId: project ? String(project._id) : undefined, projectContext });
    res.status(201).json({ data: toSafeInterview(session) });
  } catch (err) { next(err); }
}

export async function submitAnswer(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { answer } = req.body as { answer?: unknown };
    if (typeof answer !== 'string' || !answer.trim()) throw new ValidationError('An answer is required.');
    if (answer.length > MAX_ANSWER_LENGTH) throw new ValidationError(`Answer is too long (max ${MAX_ANSWER_LENGTH} characters).`);
    const existing = await interviewService.getInterview(String(req.params.id), userId);
    let projectContext;
    if (existing.projectId) {
      const project = await projectRepository.findOwnedById(String(existing.projectId), userId);
      if (project) projectContext = await getProjectPracticeContext(project, userId);
    }
    const session = await interviewService.submitAnswer(String(req.params.id), userId, answer, projectContext);
    res.json({ data: toSafeInterview(session) });
  } catch (err) { next(err); }
}

export async function endInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await interviewService.endInterview(String(req.params.id), req.user!.id);
    res.json({ data: toSafeInterview(session) });
  } catch (err) { next(err); }
}

export async function getInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await interviewService.getInterview(String(req.params.id), req.user!.id);
    res.json({ data: toSafeInterview(session) });
  } catch (err) { next(err); }
}

export async function listInterviews(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await interviewService.listInterviews(req.user!.id);
    res.json({ data: sessions });
  } catch (err) { next(err); }
}
