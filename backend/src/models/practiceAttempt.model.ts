import mongoose, { Schema, Document } from 'mongoose';
import { ChallengeFile } from './practiceChallenge.model';

export type AttemptStatus = 'in_progress' | 'passed' | 'failed' | 'abandoned';
export type RunStatus = 'idle' | 'passed' | 'failed' | 'error' | 'deferred';

export interface RunResult {
  status: RunStatus;
  output?: string;
  errors?: string[];
  ranAt?: Date;
  /** Where this observation came from. 'browser-sandbox' results are reported BY THE LEARNER'S OWN BROWSER and
   * are never proof of anything — see `trusted` below. */
  source?: 'browser-sandbox' | 'server';
  /** SECURITY: a browser-sandbox result is always untrusted (the client can forge any status/output it likes).
   * Only a server-side evaluation (the AI checker, or a future real trusted execution layer) may set this true.
   * `attempt.status` must never be derived from a RunResult with trusted !== true — see checker.ts / attemptService.ts. */
  trusted: boolean;
}

export interface EvaluationResult {
  status: 'pending' | 'passed' | 'needs_work' | 'failed';
  feedback?: string;
  strengths?: string[];
  issues?: string[];
  evaluatedAt?: Date;
}

export interface IPracticeAttempt extends Document {
  userId: string;
  challengeId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  files: ChallengeFile[];
  attemptNumber: number;
  hintsUsed: number; // 0-3, gates which hint the API will return
  solutionRevealed: boolean;
  /** True only if solutionRevealed was already true at the moment this attempt was marked passed — a
   * truthful, persisted fact (never fabricated), so progress can distinguish an independent solve from an
   * assisted one without altering the real pass/fail result (Issue #15). Undefined until the attempt passes. */
  assistedSolve?: boolean;
  runResult?: RunResult;
  evaluation?: EvaluationResult;
  status: AttemptStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ChallengeFileSchema = new Schema<ChallengeFile>({ path: { type: String, required: true }, content: { type: String, required: true } }, { _id: false });

const PracticeAttemptSchema = new Schema<IPracticeAttempt>(
  {
    userId: { type: String, required: true, index: true },
    challengeId: { type: Schema.Types.ObjectId, ref: 'PracticeChallenge', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    files: { type: [ChallengeFileSchema], default: [] },
    attemptNumber: { type: Number, default: 1, required: true },
    hintsUsed: { type: Number, default: 0, min: 0, max: 3 },
    solutionRevealed: { type: Boolean, default: false },
    assistedSolve: { type: Boolean },
    runResult: {
      status: { type: String, enum: ['idle', 'passed', 'failed', 'error', 'deferred'], default: 'idle' },
      output: { type: String },
      errors: [{ type: String }],
      ranAt: { type: Date },
      source: { type: String, enum: ['browser-sandbox', 'server'] },
      trusted: { type: Boolean, default: false },
    },
    evaluation: {
      status: { type: String, enum: ['pending', 'passed', 'needs_work', 'failed'] },
      feedback: { type: String },
      strengths: [{ type: String }],
      issues: [{ type: String }],
      evaluatedAt: { type: Date },
    },
    status: { type: String, required: true, enum: ['in_progress', 'passed', 'failed', 'abandoned'], default: 'in_progress', index: true },
  },
  // autoIndex is deliberately off here: the partial unique index below can only be built safely AFTER
  // migratePracticeAttempts() has resolved any pre-existing duplicate in_progress attempts (see
  // practice/migrations.ts) — see index.ts, which runs the migration then calls syncIndexes() explicitly.
  { timestamps: true, autoIndex: false },
);

// Real attempt history: one document PER attempt, never overwritten by a reset. attemptNumber is unique per
// user+challenge so two concurrent "reset" calls can't collide on the same number.
PracticeAttemptSchema.index({ userId: 1, challengeId: 1, attemptNumber: 1 }, { unique: true });
// CRITICAL: enforces "at most one in_progress attempt per user+challenge" AT THE DATABASE LEVEL — this is
// what actually prevents two concurrent getOrCreateAttempt()/resetAttempt() calls from both creating an
// active attempt (an application-level "find then create" check is inherently racy; this index is not).
// A partial index only applies to documents matching the filter, so historical passed/failed/abandoned
// attempts for the same user+challenge are completely unaffected and can accumulate freely.
PracticeAttemptSchema.index(
  { userId: 1, challengeId: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress' }, name: 'one_active_attempt_per_challenge' },
);
PracticeAttemptSchema.index({ userId: 1, challengeId: 1, updatedAt: -1 });
PracticeAttemptSchema.index({ userId: 1, projectId: 1, updatedAt: -1 });
PracticeAttemptSchema.index({ userId: 1, status: 1, updatedAt: -1 });

/** Safe DTO for a normal attempt response. Drops `runResult.trusted`/`runResult.source` (internal security
 * metadata the client doesn't need — the UI already gets an honest, non-authoritative label purely from
 * `runResult.status`) while keeping everything the editor/UI actually uses. Attempts never contain solution
 * fields in the first place (they're never copied in), so there's nothing to strip there. */
export function toSafeAttempt(doc: IPracticeAttempt) {
  const obj = doc.toObject() as Record<string, unknown>;
  if (obj.runResult && typeof obj.runResult === 'object') {
    const { trusted: _trusted, source: _source, ...safeRun } = obj.runResult as Record<string, unknown>;
    obj.runResult = safeRun;
  }
  return obj;
}

export const PracticeAttempt = mongoose.model<IPracticeAttempt>('PracticeAttempt', PracticeAttemptSchema);
