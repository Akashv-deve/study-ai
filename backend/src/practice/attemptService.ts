import mongoose from 'mongoose';
import { PracticeAttempt, IPracticeAttempt } from '../models/practiceAttempt.model';
import { PracticeChallenge, IPracticeChallenge } from '../models/practiceChallenge.model';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors';
import { checkAttempt } from './checker';
import { isClientExecuted, deferredRunResult, acceptClientRunResult } from './runner';
import { visibilityFilter } from './challengeService';
import { geminiProvider } from '../ai/gemini.provider';

const MAX_FILES = 20;
const MAX_FILE_CONTENT = 200_000;
const HISTORY_PAGE_SIZE = 50;

async function loadOwnedChallenge(challengeId: string, userId: string, projectId?: string): Promise<IPracticeChallenge> {
  if (!mongoose.isValidObjectId(challengeId)) throw new NotFoundError('Challenge not found');
  const challenge = await PracticeChallenge.findOne({ _id: challengeId, ...visibilityFilter(userId, projectId) });
  if (!challenge) throw new NotFoundError('Challenge not found');
  return challenge;
}

async function loadOwnedAttempt(attemptId: string, userId: string): Promise<IPracticeAttempt> {
  if (!mongoose.isValidObjectId(attemptId)) throw new NotFoundError('Attempt not found');
  const attempt = await PracticeAttempt.findOne({ _id: attemptId, userId });
  if (!attempt) throw new NotFoundError('Attempt not found');
  return attempt;
}

/** Only an in_progress attempt can be edited/run/checked/hinted/revealed — once finalized, further work belongs to a new attempt (via reset). */
function assertInProgress(attempt: Pick<IPracticeAttempt, 'status'>): void {
  if (attempt.status !== 'in_progress') throw new ValidationError('This attempt has already been finalized. Start a new attempt to keep working on this challenge.');
}

const ACTIVE_ATTEMPT_INDEX_NAME = 'one_active_attempt_per_challenge';
const MAX_CREATE_RETRIES = 5;

function duplicateKeyKind(err: unknown): 'active-attempt' | 'attempt-number' | null {
  const e = err as { code?: number; keyPattern?: Record<string, unknown>; message?: string };
  if (e?.code !== 11000) return null;
  if (e.keyPattern) {
    if ('attemptNumber' in e.keyPattern) return 'attempt-number';
    if ('userId' in e.keyPattern && 'challengeId' in e.keyPattern) return 'active-attempt';
  }
  // Fallback for driver versions that don't surface keyPattern on the error — the partial index has an
  // explicit name, and MongoDB always includes the violated index's name in the E11000 message.
  if (e.message?.includes(ACTIVE_ATTEMPT_INDEX_NAME)) return 'active-attempt';
  if (e.message?.includes('attemptNumber')) return 'attempt-number';
  return null;
}

/** Creates the next attempt document for a user+challenge. Race-safe against BOTH unique constraints:
 *
 * - If the collision is on the partial "one active attempt" index, another concurrent request already won
 *   the race to create the active attempt for this user+challenge — re-read and return THAT document
 *   rather than erroring or creating a second one. This is what makes 10 concurrent getOrCreateAttempt()
 *   calls all resolve to the exact same attempt (Critical Fix #2).
 * - If the collision is on (userId, challengeId, attemptNumber), two requests computed the same "next
 *   number" — recompute from the latest persisted state and retry, bounded so a pathological case can
 *   never recurse forever. */
async function createNextAttempt(challenge: IPracticeChallenge, userId: string, projectId: string | undefined, attempt = 0): Promise<IPracticeAttempt> {
  const latest = await PracticeAttempt.findOne({ userId, challengeId: challenge._id }).sort({ attemptNumber: -1 }).select('attemptNumber');
  const nextNumber = (latest?.attemptNumber ?? 0) + 1;
  try {
    return await PracticeAttempt.create({
      userId, challengeId: challenge._id, projectId: challenge.projectId ?? projectId,
      files: challenge.starterFiles.map((f) => ({ path: f.path, content: f.content })),
      attemptNumber: nextNumber, hintsUsed: 0, solutionRevealed: false, status: 'in_progress',
    });
  } catch (err) {
    const kind = duplicateKeyKind(err);
    if (kind === 'active-attempt') {
      const winner = await PracticeAttempt.findOne({ userId, challengeId: challenge._id, status: 'in_progress' }).sort({ attemptNumber: -1 });
      if (winner) return winner;
      // Vanishingly unlikely (the winner would have to be reset/finalized in the instant between our
      // failed insert and this read) — fall through to one bounded retry rather than erroring the user out.
    }
    if ((kind === 'active-attempt' || kind === 'attempt-number') && attempt < MAX_CREATE_RETRIES) {
      return createNextAttempt(challenge, userId, projectId, attempt + 1);
    }
    throw err;
  }
}

/** Returns the user's current in-progress attempt for a challenge, or starts Attempt 1. Refreshing the
 * browser never loses it, and — because the database enforces at most one in_progress attempt per
 * user+challenge — concurrent requests can never each create their own: exactly one document is ever
 * created, and every caller ends up returning that same document (Critical Fix #2). */
export async function getOrCreateAttempt(challengeId: string, userId: string, projectId?: string): Promise<IPracticeAttempt> {
  const challenge = await loadOwnedChallenge(challengeId, userId, projectId);
  const existing = await PracticeAttempt.findOne({ userId, challengeId: challenge._id, status: 'in_progress' }).sort({ attemptNumber: -1 });
  if (existing) return existing;
  return createNextAttempt(challenge, userId, projectId);
}

/** Real attempt history: every past attempt is its own untouched document. Never includes solution fields
 * (attempts never store them anyway) and omits full file contents to keep the payload bounded. */
export async function getAttemptHistory(challengeId: string, userId: string, projectId: string | undefined, page = 1): Promise<{ attempts: unknown[]; page: number; hasMore: boolean }> {
  await loadOwnedChallenge(challengeId, userId, projectId);
  const skip = Math.max(0, (page - 1) * HISTORY_PAGE_SIZE);
  const rows = await PracticeAttempt.find({ userId, challengeId })
    .select('attemptNumber status hintsUsed solutionRevealed evaluation.status evaluation.feedback runResult.status runResult.trusted createdAt updatedAt')
    .sort({ attemptNumber: -1 })
    .skip(skip)
    .limit(HISTORY_PAGE_SIZE + 1)
    .lean();
  return { attempts: rows.slice(0, HISTORY_PAGE_SIZE), page, hasMore: rows.length > HISTORY_PAGE_SIZE };
}

/** Validates a file submission strictly and REJECTS anything malformed or oversized rather than silently
 * truncating/dropping it (Small Issue #34) — the learner should see a clear error, not silently lose part
 * of what they wrote. Paths are normalized (leading "./" and "\" stripped, trimmed) so the same logical
 * path can't accidentally produce two different-looking entries. */
function validateFiles(files: unknown): { path: string; content: string }[] {
  if (!Array.isArray(files) || files.length === 0) throw new ValidationError('At least one file is required.');
  if (files.length > MAX_FILES) throw new ValidationError(`Too many files (${files.length} > ${MAX_FILES}).`);
  const seen = new Set<string>();
  const normalized = files.map((f: unknown, i: number) => {
    const entry = f as { path?: unknown; content?: unknown } | null;
    if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' || typeof entry.content !== 'string') {
      throw new ValidationError(`File ${i + 1} is malformed.`);
    }
    const path = entry.path.trim().replace(/^\.?\/+/, '').replace(/\\/g, '/');
    if (path.length === 0) throw new ValidationError(`File ${i + 1} has an empty path.`);
    if (path.length > 300) throw new ValidationError(`File ${i + 1}'s path is too long (max 300 characters).`);
    if (entry.content.length > MAX_FILE_CONTENT) throw new ValidationError(`"${path}" is too large (max ${MAX_FILE_CONTENT} characters).`);
    if (seen.has(path)) throw new ValidationError(`Duplicate file path: "${path}".`);
    seen.add(path);
    return { path, content: entry.content };
  });
  return normalized;
}

export async function saveAttemptFiles(attemptId: string, userId: string, files: unknown): Promise<IPracticeAttempt> {
  const validated = validateFiles(files);
  const attempt = await loadOwnedAttempt(attemptId, userId);
  assertInProgress(attempt);
  attempt.files = validated;
  await attempt.save();
  return attempt;
}

/** Finalizes the current attempt (if still in progress, as 'abandoned' — it was neither passed nor failed by
 * a real evaluation) and starts a brand-new attempt document. The old one is never mutated further and
 * remains in history. */
/** Finalizes the current attempt and starts a brand-new one — race-safe against a concurrent reset on the
 * SAME attempt (Critical Fix #3). The abandon step is an atomic conditional update keyed on the document
 * still being in_progress: only the first of two racing reset calls can actually flip it. The loser, seeing
 * its update match nothing, knows someone else is already handling this reset and looks for the
 * already-created (or about-to-exist) active attempt instead of finalizing anything a second time or
 * creating a duplicate — and if it's not there yet, createNextAttempt()'s own partial-index collision
 * handling (see above) closes that last narrow window. */
export async function resetAttempt(attemptId: string, userId: string): Promise<IPracticeAttempt> {
  const attempt = await loadOwnedAttempt(attemptId, userId);
  const challenge = await PracticeChallenge.findById(attempt.challengeId);
  if (!challenge) throw new NotFoundError('Challenge not found');
  const projectId = attempt.projectId ? String(attempt.projectId) : undefined;

  if (attempt.status === 'in_progress') {
    const flipped = await PracticeAttempt.findOneAndUpdate({ _id: attempt._id, status: 'in_progress' }, { $set: { status: 'abandoned' } });
    if (!flipped) {
      // Someone else's concurrent reset already finalized this exact attempt — don't finalize or create
      // anything ourselves; just hand back whatever active attempt now exists (or is in the process of
      // being created, in which case createNextAttempt's own race handling below takes over).
      const active = await PracticeAttempt.findOne({ userId, challengeId: challenge._id, status: 'in_progress' }).sort({ attemptNumber: -1 });
      if (active) return active;
    }
  }
  return createNextAttempt(challenge, userId, projectId);
}

/** Records what the browser sandbox observed. This is explicitly UNTRUSTED — the client can report any
 * status it likes, so it is stored with `trusted: false` and NEVER changes attempt.status. Only
 * checkAndEvaluate() (server-side) can mark an attempt passed/failed. */
export async function recordRun(attemptId: string, userId: string, clientResult?: { status: unknown; output?: unknown; errors?: unknown }): Promise<IPracticeAttempt> {
  const attempt = await loadOwnedAttempt(attemptId, userId);
  assertInProgress(attempt);
  const challenge = await PracticeChallenge.findById(attempt.challengeId).select('technology');
  if (!challenge) throw new NotFoundError('Challenge not found');

  attempt.runResult = isClientExecuted(challenge.technology) && clientResult
    ? { ...acceptClientRunResult(clientResult), source: 'browser-sandbox', trusted: false }
    : { ...deferredRunResult(challenge.technology), trusted: false };
  await attempt.save();
  return attempt;
}

/** The ONLY path that can mark an attempt passed/failed. Runs the checker against the learner's actual
 * submitted code. Deterministic output-match checking is only used when the run result feeding it is
 * server-trusted — today that never happens (no trusted execution layer exists yet), so every attempt is
 * judged by AI reading the submitted code, never by a client-reported output string. */
export async function checkAndEvaluate(attemptId: string, userId: string): Promise<IPracticeAttempt> {
  const attempt = await loadOwnedAttempt(attemptId, userId);
  assertInProgress(attempt);
  const challenge = await PracticeChallenge.findById(attempt.challengeId).select('title instructions expectedBehavior evaluationCriteria technology topic');
  if (!challenge) throw new NotFoundError('Challenge not found');

  const trustedRunOutput = attempt.runResult?.trusted === true ? attempt.runResult.output : undefined;
  const evaluation = await checkAttempt({ challenge, files: attempt.files, runOutput: trustedRunOutput });
  attempt.evaluation = evaluation;
  if (evaluation.status === 'passed') {
    attempt.status = 'passed';
    // Small Issue #15: a truthful, persisted fact — never changes the real pass result, just distinguishes
    // an independent solve from one where the solution had already been revealed on this attempt.
    attempt.assistedSolve = attempt.solutionRevealed;
  } else if (evaluation.status === 'failed') attempt.status = 'failed';
  else attempt.status = 'in_progress';
  await attempt.save();
  return attempt;
}

/** Atomically unlocks exactly the next hint. findOneAndUpdate's filter+update pair is applied as a single
 * document operation by MongoDB, so two concurrent requests are serialized against the real persisted
 * hintsUsed value — neither can double-unlock the same level or skip one, even if they race in Node. */
export async function requestHint(attemptId: string, userId: string): Promise<{ hint: string; hintLevel: number; hintsRemaining: number }> {
  if (!mongoose.isValidObjectId(attemptId)) throw new NotFoundError('Attempt not found');
  const attemptForChallenge = await PracticeAttempt.findOne({ _id: attemptId, userId }).select('challengeId status');
  if (!attemptForChallenge) throw new NotFoundError('Attempt not found');
  assertInProgress(attemptForChallenge);
  const challenge = await PracticeChallenge.findById(attemptForChallenge.challengeId).select('hints hintCount');
  if (!challenge) throw new NotFoundError('Challenge not found');
  if (challenge.hintCount === 0) throw new ValidationError('This challenge has no hints.');
  // Defense-in-depth against Small Issue #8: the pre-save hook keeps this consistent going forward, but
  // fail loudly (never return undefined hint text) if any pre-existing data is somehow still inconsistent.
  if (challenge.hintCount !== challenge.hints.length) {
    throw new ValidationError('This challenge has inconsistent hint data and cannot provide a hint right now. Please report this challenge.');
  }

  const updated = await PracticeAttempt.findOneAndUpdate(
    { _id: attemptId, userId, status: 'in_progress', hintsUsed: { $lt: challenge.hintCount } },
    { $inc: { hintsUsed: 1 } },
    { new: true },
  );
  if (!updated) throw new ValidationError('No more hints available for this challenge.');
  const hintIndex = updated.hintsUsed - 1;
  return { hint: challenge.hints[hintIndex], hintLevel: updated.hintsUsed, hintsRemaining: Math.max(0, challenge.hintCount - updated.hintsUsed) };
}

/** Requires every available hint to be unlocked first — reveal is the end of the ladder, not a shortcut. */
export async function revealSolution(attemptId: string, userId: string): Promise<{ referenceSolution: string; referenceSolutionFiles: { path: string; content: string }[] }> {
  const attempt = await loadOwnedAttempt(attemptId, userId);
  assertInProgress(attempt);
  const challenge = await PracticeChallenge.findById(attempt.challengeId).select('+referenceSolution +referenceSolutionFiles hintCount');
  if (!challenge) throw new NotFoundError('Challenge not found');
  if (attempt.hintsUsed < challenge.hintCount) {
    throw new ValidationError(`Use all ${challenge.hintCount} hints before revealing the solution (${attempt.hintsUsed}/${challenge.hintCount} used).`);
  }
  attempt.solutionRevealed = true;
  await attempt.save();
  return { referenceSolution: challenge.referenceSolution, referenceSolutionFiles: challenge.referenceSolutionFiles };
}

export async function explainMistake(attemptId: string, userId: string): Promise<string> {
  const attempt = await loadOwnedAttempt(attemptId, userId);
  // Intentionally selects only public fields — the reference solution must never enter this prompt (Issue #9).
  const challenge = await PracticeChallenge.findById(attempt.challengeId).select('title instructions expectedBehavior technology topic');
  if (!challenge) throw new NotFoundError('Challenge not found');
  if (!geminiProvider.isAvailable()) return 'AI explanations are not configured on this server yet.';

  const prompt = [
    `The learner attempted this ${challenge.technology} challenge: "${challenge.title}".`,
    `Instructions: ${challenge.instructions}`,
    challenge.expectedBehavior ? `Expected behavior: ${challenge.expectedBehavior}` : '',
    `Their submitted code:\n${attempt.files.map((f) => `--- ${f.path} ---\n${f.content.slice(0, 4000)}`).join('\n\n')}`,
    attempt.evaluation?.feedback ? `Prior evaluation feedback: ${attempt.evaluation.feedback}` : '',
    attempt.runResult?.output ? `Run output (learner's own browser, may be incomplete): ${attempt.runResult.output.slice(0, 1000)}` : '',
  ].filter(Boolean).join('\n\n');

  const system = 'Explain the mistake in this order: Problem, Why it happened, Concept involved, What to inspect, Hint. Do NOT give the complete corrected code or full solution — the learner must still fix it themselves. You have NOT been given the reference solution; do not claim to know it. Be specific to their actual code, not generic advice. Plain text, no markdown headers, a short paragraph per section.';
  const explanation = await geminiProvider.generate(prompt, system);
  return explanation.slice(0, 4000); // bounded response (Small Issue #33)
}

export async function getAttempt(attemptId: string, userId: string): Promise<IPracticeAttempt> {
  return loadOwnedAttempt(attemptId, userId);
}

export function assertOwnsAttempt(attempt: IPracticeAttempt, userId: string): void {
  if (attempt.userId !== userId) throw new ForbiddenError('You do not have permission to access this attempt');
}
