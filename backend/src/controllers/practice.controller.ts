import { Request, Response, NextFunction } from 'express';
import { projectRepository } from '../repositories/project.repository';
import { NotFoundError, ValidationError } from '../utils/errors';
import { getProjectPracticeContext } from '../practice/projectContext';
import * as challengeService from '../practice/challengeService';
import * as attemptService from '../practice/attemptService';
import * as progressService from '../practice/progressService';
import { PracticeDifficulty, PracticeMode, PracticeTechnology, toPublicChallenge } from '../models/practiceChallenge.model';
import { toSafeAttempt } from '../models/practiceAttempt.model';

const TECHNOLOGIES = ['html', 'css', 'javascript', 'react', 'nodejs', 'express', 'mongodb', 'java', 'python'];
const MODES = ['learn', 'practice', 'interview', 'build', 'debug'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

/** projectId is never trusted from the client without an ownership check — this is the single choke point every handler below routes through. */
async function requireOwnedProjectIfGiven(projectId: string | undefined, userId: string) {
  if (!projectId) return undefined;
  const project = await projectRepository.findOwnedById(projectId, userId);
  if (!project) throw new NotFoundError('Project not found');
  return project;
}

export async function listChallenges(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { technology, mode, difficulty, topic, projectId } = req.query as Record<string, string | undefined>;
    if (technology && !TECHNOLOGIES.includes(technology)) throw new ValidationError('Invalid technology');
    if (mode && !MODES.includes(mode)) throw new ValidationError('Invalid mode');
    if (difficulty && !DIFFICULTIES.includes(difficulty)) throw new ValidationError('Invalid difficulty');
    await requireOwnedProjectIfGiven(projectId, userId);
    const challenges = await challengeService.listChallenges({
      userId, projectId,
      technology: technology as PracticeTechnology | undefined,
      mode: mode as PracticeMode | undefined,
      difficulty: difficulty as PracticeDifficulty | undefined,
      topic,
    });
    res.json({ data: challenges });
  } catch (err) { next(err); }
}

export async function getChallenge(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const projectId = req.query.projectId as string | undefined;
    await requireOwnedProjectIfGiven(projectId, userId);
    const challenge = await challengeService.getChallengePublic(String(req.params.id), userId, projectId);
    if (!challenge) throw new NotFoundError('Challenge not found');
    res.json({ data: challenge });
  } catch (err) { next(err); }
}

export async function generateChallenge(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { technology, mode, difficulty, topic, projectId } = req.body as Record<string, string | undefined>;
    if (!technology || !TECHNOLOGIES.includes(technology)) throw new ValidationError('A valid technology is required');
    if (!mode || !MODES.includes(mode)) throw new ValidationError('A valid mode is required');
    if (!difficulty || !DIFFICULTIES.includes(difficulty)) throw new ValidationError('A valid difficulty is required');
    if (topic !== undefined && (typeof topic !== 'string' || topic.length > 100)) throw new ValidationError('Topic must be a string of at most 100 characters');
    const project = await requireOwnedProjectIfGiven(projectId, userId);
    const projectContext = project ? await getProjectPracticeContext(project, userId) : undefined;
    const challenge = await challengeService.generateChallenge({
      userId, projectId: project ? String(project._id) : undefined, projectContext,
      technology: technology as PracticeTechnology, mode: mode as PracticeMode, difficulty: difficulty as PracticeDifficulty, topic,
    });
    res.status(201).json({ data: toPublicChallenge(challenge) });
  } catch (err) { next(err); }
}

export async function getOrCreateAttempt(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const projectId = req.query.projectId as string | undefined;
    await requireOwnedProjectIfGiven(projectId, userId);
    const attempt = await attemptService.getOrCreateAttempt(String(req.params.challengeId), userId, projectId);
    res.json({ data: toSafeAttempt(attempt) });
  } catch (err) { next(err); }
}

export async function getAttemptHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const projectId = req.query.projectId as string | undefined;
    const pageRaw = Number(req.query.page);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    await requireOwnedProjectIfGiven(projectId, userId);
    const history = await attemptService.getAttemptHistory(String(req.params.challengeId), userId, projectId, page);
    res.json({ data: history });
  } catch (err) { next(err); }
}

export async function saveAttempt(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { files } = req.body as { files: { path: string; content: string }[] };
    const attempt = await attemptService.saveAttemptFiles(String(req.params.id), userId, files);
    res.json({ data: toSafeAttempt(attempt) });
  } catch (err) { next(err); }
}

export async function resetAttempt(req: Request, res: Response, next: NextFunction) {
  try {
    const attempt = await attemptService.resetAttempt(String(req.params.id), req.user!.id);
    res.json({ data: toSafeAttempt(attempt) });
  } catch (err) { next(err); }
}

export async function runAttempt(req: Request, res: Response, next: NextFunction) {
  try {
    const attempt = await attemptService.recordRun(String(req.params.id), req.user!.id, req.body);
    res.json({ data: toSafeAttempt(attempt) });
  } catch (err) { next(err); }
}

export async function checkAttempt(req: Request, res: Response, next: NextFunction) {
  try {
    const attempt = await attemptService.checkAndEvaluate(String(req.params.id), req.user!.id);
    res.json({ data: toSafeAttempt(attempt) });
  } catch (err) { next(err); }
}

export async function requestHint(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await attemptService.requestHint(String(req.params.id), req.user!.id);
    res.json({ data: result });
  } catch (err) { next(err); }
}

export async function revealSolution(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await attemptService.revealSolution(String(req.params.id), req.user!.id);
    res.json({ data: result });
  } catch (err) { next(err); }
}

export async function explainMistake(req: Request, res: Response, next: NextFunction) {
  try {
    const explanation = await attemptService.explainMistake(String(req.params.id), req.user!.id);
    res.json({ data: { explanation } });
  } catch (err) { next(err); }
}

export async function getAttempt(req: Request, res: Response, next: NextFunction) {
  try {
    const attempt = await attemptService.getAttempt(String(req.params.id), req.user!.id);
    res.json({ data: toSafeAttempt(attempt) });
  } catch (err) { next(err); }
}

export async function getProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await progressService.getProgressSummary(req.user!.id);
    res.json({ data: summary });
  } catch (err) { next(err); }
}

export async function getProjectContext(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const project = await projectRepository.findOwnedById(String(req.params.projectId), userId);
    if (!project) throw new NotFoundError('Project not found');
    const context = await getProjectPracticeContext(project, userId);
    res.json({ data: context });
  } catch (err) { next(err); }
}
