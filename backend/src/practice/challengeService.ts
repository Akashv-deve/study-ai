import mongoose from 'mongoose';
import { PracticeChallenge, IPracticeChallenge, CHALLENGE_PUBLIC_FIELDS, PracticeTechnology, PracticeMode, PracticeDifficulty } from '../models/practiceChallenge.model';
import { geminiProvider } from '../ai/gemini.provider';
import { ValidationError } from '../utils/errors';
import { IProjectPracticeContext } from '../models/projectPracticeContext.model';

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
const MAX_TOPIC_FILTER_LENGTH = 100;

export interface ChallengeFilters {
  technology?: PracticeTechnology;
  mode?: PracticeMode;
  difficulty?: PracticeDifficulty;
  topic?: string;
  projectId?: string;
  userId: string;
  page?: number;
  pageSize?: number;
}

/** Any challenge the user is allowed to see: system challenges, their own project-specific ones, or ones they generated for themselves. */
export function visibilityFilter(userId: string, projectId?: string) {
  const or: Record<string, unknown>[] = [{ visibility: 'system' }, { visibility: 'private', ownerId: userId }];
  if (projectId) or.push({ visibility: 'project', projectId });
  return { $or: or };
}

/** Bounded pagination (Small Issue #11) — never an unbounded collection. `_id` is a deterministic tiebreaker
 * so page boundaries stay stable even when several challenges share a createdAt timestamp. */
export async function listChallenges(filters: ChallengeFilters) {
  const query: Record<string, unknown> = visibilityFilter(filters.userId, filters.projectId);
  const and: Record<string, unknown>[] = [query];
  if (filters.technology) and.push({ technology: filters.technology });
  if (filters.mode) and.push({ mode: filters.mode });
  if (filters.difficulty) and.push({ difficulty: filters.difficulty });
  if (filters.topic) and.push({ topic: filters.topic.slice(0, MAX_TOPIC_FILTER_LENGTH) });
  const finalQuery = and.length > 1 ? { $and: and } : query;

  const page = Number.isInteger(filters.page) && (filters.page as number) >= 1 ? (filters.page as number) : 1;
  const pageSize = Number.isInteger(filters.pageSize) && (filters.pageSize as number) > 0 ? Math.min(filters.pageSize as number, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return PracticeChallenge.find(finalQuery).select(CHALLENGE_PUBLIC_FIELDS).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean();
}

/** Never selects the solution fields — use getChallengeWithSolution only after a reveal/ownership check. */
export async function getChallengePublic(id: string, userId: string, projectId?: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  return PracticeChallenge.findOne({ _id: id, ...visibilityFilter(userId, projectId) }).select(CHALLENGE_PUBLIC_FIELDS).lean();
}

export async function getChallengeWithSolution(id: string, userId: string, projectId?: string): Promise<IPracticeChallenge | null> {
  if (!mongoose.isValidObjectId(id)) return null;
  return PracticeChallenge.findOne({ _id: id, ...visibilityFilter(userId, projectId) }).select('+referenceSolution +referenceSolutionFiles');
}

const GENERATE_SYSTEM_PROMPT = `You are a technical curriculum designer generating ONE hands-on coding practice challenge.
Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{
  "title": "short title",
  "description": "1-2 sentences",
  "instructions": "what the learner must do, clear and specific",
  "topic": "short topic label, e.g. 'array methods'",
  "expectedBehavior": "what correct output/behavior looks like",
  "starterFiles": [{"path":"string","content":"string"}],
  "hints": ["hint 1 (gentle nudge)", "hint 2 (more specific)", "hint 3 (nearly the approach)"],
  "referenceSolution": "the model solution as a short explanation",
  "referenceSolutionFiles": [{"path":"string","content":"string"}]
}
Rules: exactly 3 hints, each strictly more revealing than the last but none may contain the full solution. starterFiles must be runnable/non-trivial but must NOT already solve the task. Keep everything scoped to the requested technology/topic/difficulty only.`;

function buildGeneratePrompt(params: { technology: string; mode: string; difficulty: string; topic?: string; projectContext?: IProjectPracticeContext }): string {
  const lines = [`Generate a ${params.difficulty} difficulty "${params.mode}" challenge for ${params.technology}.`];
  if (params.topic) lines.push(`Focus topic: ${params.topic}.`);
  if (params.projectContext) {
    lines.push('This challenge must relate to the following REAL project (use only what is stated below; never invent features not listed):');
    lines.push(params.projectContext.digest);
  }
  return lines.join('\n');
}

interface GeneratedChallengeJson {
  title?: string; description?: string; instructions?: string; topic?: string; expectedBehavior?: string;
  starterFiles?: { path?: string; content?: string }[];
  hints?: string[];
  referenceSolution?: string;
  referenceSolutionFiles?: { path?: string; content?: string }[];
}

function parseGeneratedChallenge(raw: string): GeneratedChallengeJson {
  const cleaned = raw.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned) as GeneratedChallengeJson;
  } catch {
    throw new ValidationError('The AI did not return a usable challenge. Try generating again.');
  }
}

export interface GenerateChallengeParams {
  technology: PracticeTechnology;
  mode: PracticeMode;
  difficulty: PracticeDifficulty;
  topic?: string;
  userId: string;
  projectId?: string;
  projectContext?: IProjectPracticeContext;
}

const LIMITS = {
  title: 200, description: 500, instructions: 4000, topic: 100, expectedBehavior: 1000,
  hint: 500, referenceSolution: 4000, filePath: 300, fileContent: 20_000,
  maxFiles: 8, maxTotalFileContent: 80_000,
};

function cleanFiles(files: unknown, label: string): { path: string; content: string }[] {
  if (files === undefined) return [];
  if (!Array.isArray(files)) throw new ValidationError(`The AI's ${label} were malformed. Try generating again.`);
  if (files.length > LIMITS.maxFiles) throw new ValidationError(`The AI generated too many ${label} (${files.length} > ${LIMITS.maxFiles}). Try generating again.`);
  const cleaned = files.map((f: unknown, i: number) => {
    const entry = f as { path?: unknown; content?: unknown } | null;
    if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' || entry.path.length === 0 || typeof entry.content !== 'string') {
      throw new ValidationError(`The AI's ${label} (entry ${i + 1}) was malformed. Try generating again.`);
    }
    if (entry.path.length > LIMITS.filePath) throw new ValidationError(`The AI's ${label} (entry ${i + 1}) has too long a path. Try generating again.`);
    return { path: entry.path, content: entry.content.slice(0, LIMITS.fileContent) };
  });
  const totalSize = cleaned.reduce((sum, f) => sum + f.content.length, 0);
  if (totalSize > LIMITS.maxTotalFileContent) throw new ValidationError(`The AI generated ${label} that are too large. Try generating again.`);
  return cleaned;
}

/** Validates AI output before it ever reaches MongoDB — Gemini output is never trusted blindly (Issues
 * #5/#6/#9). Every field is checked with `typeof`, not just optional-chained: `parsed` is untrusted
 * JSON.parse output cast to a type, so a malformed response (e.g. title as a number) must fail cleanly
 * here rather than throwing a raw TypeError from deep inside .trim(). */
function validateAndCleanGenerated(parsed: GeneratedChallengeJson): {
  title: string; description: string; instructions: string; topic: string; expectedBehavior: string;
  starterFiles: { path: string; content: string }[]; hints: string[]; referenceSolution: string; referenceSolutionFiles: { path: string; content: string }[];
} {
  const requireString = (value: unknown, field: string): string => {
    if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`The AI response was missing a valid "${field}". Try generating again.`);
    return value;
  };
  const optionalString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

  const title = requireString(parsed.title, 'title');
  const instructions = requireString(parsed.instructions, 'instructions');
  const referenceSolution = requireString(parsed.referenceSolution, 'referenceSolution');
  const description = optionalString(parsed.description);
  const topic = optionalString(parsed.topic, 'general');
  const expectedBehavior = optionalString(parsed.expectedBehavior);

  if (!Array.isArray(parsed.hints)) throw new ValidationError('The AI response was missing a valid "hints" array. Try generating again.');
  const hints = parsed.hints.filter((h): h is string => typeof h === 'string' && h.trim().length > 0).map((h) => h.slice(0, LIMITS.hint));
  if (hints.length !== parsed.hints.length) throw new ValidationError('The AI generated a malformed hint. Try generating again.');
  if (hints.length !== 3) throw new ValidationError(`The AI must generate exactly 3 hints (got ${hints.length}). Try generating again.`);

  return {
    title: title.slice(0, LIMITS.title),
    description: description.slice(0, LIMITS.description),
    instructions: instructions.slice(0, LIMITS.instructions),
    topic: topic.slice(0, LIMITS.topic),
    expectedBehavior: expectedBehavior.slice(0, LIMITS.expectedBehavior),
    starterFiles: cleanFiles(parsed.starterFiles, 'starter files'),
    hints,
    referenceSolution: referenceSolution.slice(0, LIMITS.referenceSolution),
    referenceSolutionFiles: cleanFiles(parsed.referenceSolutionFiles, 'reference solution files'),
  };
}

export async function generateChallenge(params: GenerateChallengeParams): Promise<IPracticeChallenge> {
  if (!geminiProvider.isAvailable()) throw new ValidationError('AI generation is not configured on this server.');
  const raw = await geminiProvider.generate(buildGeneratePrompt(params), GENERATE_SYSTEM_PROMPT);
  const parsed = parseGeneratedChallenge(raw);
  const clean = validateAndCleanGenerated(parsed);

  return PracticeChallenge.create({
    technology: params.technology,
    mode: params.mode,
    title: clean.title,
    description: clean.description,
    instructions: clean.instructions,
    difficulty: params.difficulty,
    topic: clean.topic || params.topic || 'general',
    tags: [],
    starterFiles: clean.starterFiles,
    expectedBehavior: clean.expectedBehavior,
    evaluationCriteria: { kind: 'ai-only' },
    hints: clean.hints,
    hintCount: clean.hints.length,
    referenceSolution: clean.referenceSolution,
    referenceSolutionFiles: clean.referenceSolutionFiles,
    visibility: params.projectId ? 'project' : 'private',
    source: params.projectId ? 'project' : 'ai-generated',
    projectId: params.projectId,
    ownerId: params.userId,
  });
}
