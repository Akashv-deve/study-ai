import { EvaluationResult, PracticeAttempt, PracticeChallenge, RunResult } from '../types';

/** How many hints are currently visible to the learner, and whether another one can be requested. The
 * server enforces the real gate (see attemptService.requestHint's atomic findOneAndUpdate) — this only
 * drives the UI. Never derives a total from actual hint text: the client is never given hint text until
 * it's earned, so only the safe `hintCount` is available here. */
export function hintGate(challenge: Pick<PracticeChallenge, 'hintCount'>, attempt: Pick<PracticeAttempt, 'hintsUsed'>) {
  const total = challenge.hintCount;
  const unlocked = Math.min(attempt.hintsUsed, total);
  return { unlocked, total, canRequestMore: unlocked < total, allUsed: unlocked >= total };
}

/** The solution can only be offered once every hint has been used — this just describes the "earned" state; the server enforces it independently on reveal. */
export function hasEarnedSolutionOffer(challenge: Pick<PracticeChallenge, 'hintCount'>, attempt: Pick<PracticeAttempt, 'hintsUsed'>) {
  return hintGate(challenge, attempt).allUsed;
}

export function runStatusLabel(result: RunResult | undefined): string {
  if (!result || result.status === 'idle') return 'Not run yet';
  if (result.status === 'passed') return 'Sandbox run completed';
  if (result.status === 'failed') return 'Sandbox run reported an issue';
  if (result.status === 'deferred') return 'Execution not available for this technology';
  return 'Error';
}

export function evaluationStatusLabel(evaluation: EvaluationResult | undefined): string {
  if (!evaluation || evaluation.status === 'pending') return 'Not checked yet';
  if (evaluation.status === 'passed') return 'Passed';
  if (evaluation.status === 'needs_work') return 'Needs work';
  return 'Failed';
}

/** True only for technologies the browser sandbox can actually execute — everything else must use "Check" instead of "Run". */
export function isRunnable(technology: string): boolean {
  return technology === 'html' || technology === 'css' || technology === 'javascript';
}
