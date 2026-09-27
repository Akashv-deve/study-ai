import mongoose, { Schema, Document } from 'mongoose';

export type PracticeTechnology = 'html' | 'css' | 'javascript' | 'react' | 'nodejs' | 'express' | 'mongodb' | 'java' | 'python';
export const PRACTICE_TECHNOLOGIES: PracticeTechnology[] = ['html', 'css', 'javascript', 'react', 'nodejs', 'express', 'mongodb', 'java', 'python'];
export type PracticeMode = 'learn' | 'practice' | 'interview' | 'build' | 'debug';
export type PracticeDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type ChallengeVisibility = 'system' | 'project' | 'private';
export type ChallengeSource = 'system' | 'ai-generated' | 'project';

export interface ChallengeFile {
  path: string;
  content: string;
}

export interface EvaluationCriteria {
  /** What an automated checker can verify without executing arbitrary code (exact/substring output match, regex). */
  kind: 'output-match' | 'output-regex' | 'ai-only';
  expected?: string;
  pattern?: string;
}

export interface IPracticeChallenge extends Document {
  technology: PracticeTechnology;
  mode: PracticeMode;
  title: string;
  description: string;
  instructions: string;
  difficulty: PracticeDifficulty;
  topic: string;
  tags: string[];
  starterFiles: ChallengeFile[];
  expectedBehavior: string;
  /** Never selected by default — the checking mechanism (exact output, regex, hidden tests) must not leak to the client. Load with '+evaluationCriteria' only in server-side checker code. */
  evaluationCriteria: EvaluationCriteria;
  /** Never selected by default. The ONLY path that returns hint TEXT is POST /attempts/:id/hint, gated by hintsUsed. */
  hints: string[]; // exactly 3 for AI-generated challenges (validated at creation) — never sent to the client beyond the unlocked level
  /** Safe, always-selected count so the client can render "Hint (0/3)" without ever seeing hint text. */
  hintCount: number;
  referenceSolution: string;
  referenceSolutionFiles: ChallengeFile[];
  visibility: ChallengeVisibility;
  source: ChallengeSource;
  projectId?: mongoose.Types.ObjectId;
  ownerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChallengeFileSchema = new Schema<ChallengeFile>({ path: { type: String, required: true }, content: { type: String, required: true } }, { _id: false });
const EvaluationCriteriaSchema = new Schema<EvaluationCriteria>(
  { kind: { type: String, enum: ['output-match', 'output-regex', 'ai-only'], default: 'ai-only' }, expected: { type: String }, pattern: { type: String } },
  { _id: false },
);

const PracticeChallengeSchema = new Schema<IPracticeChallenge>(
  {
    technology: { type: String, required: true, enum: ['html', 'css', 'javascript', 'react', 'nodejs', 'express', 'mongodb', 'java', 'python'], index: true },
    mode: { type: String, required: true, enum: ['learn', 'practice', 'interview', 'build', 'debug'], index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    instructions: { type: String, required: true },
    difficulty: { type: String, required: true, enum: ['beginner', 'intermediate', 'advanced'], index: true },
    topic: { type: String, required: true, trim: true, index: true },
    tags: [{ type: String }],
    starterFiles: [ChallengeFileSchema],
    expectedBehavior: { type: String, default: '' },
    evaluationCriteria: { type: EvaluationCriteriaSchema, select: false, default: () => ({ kind: 'ai-only' }) },
    hints: { type: [String], select: false, validate: (v: string[]) => v.length <= 3 },
    hintCount: { type: Number, required: true, default: 0, min: 0, max: 3 },
    referenceSolution: { type: String, required: true, select: false },
    referenceSolutionFiles: { type: [ChallengeFileSchema], select: false, default: [] },
    visibility: { type: String, required: true, enum: ['system', 'project', 'private'], default: 'system', index: true },
    source: { type: String, required: true, enum: ['system', 'ai-generated', 'project'], default: 'system' },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    ownerId: { type: String, index: true },
  },
  { timestamps: true },
);

// Small Issue #8: hintCount must always agree with hints.length — enforced at the write boundary so it can
// never drift, regardless of which code path creates/edits a challenge (system-seeded or AI-generated).
PracticeChallengeSchema.pre('save', function (next) {
  if (this.isModified('hints')) this.hintCount = this.hints.length;
  next();
});

PracticeChallengeSchema.index({ technology: 1, mode: 1, difficulty: 1 });
PracticeChallengeSchema.index({ projectId: 1, visibility: 1 });

/** Fields safe to send to the client before the solution is revealed and before hints are earned.
 * Mongoose already excludes `select: false` fields (hints, evaluationCriteria, referenceSolution*) by
 * default — this projection exists as defense-in-depth so an accidental future field addition doesn't
 * silently leak, and stays explicit about intent. */
export const CHALLENGE_PUBLIC_FIELDS = '-referenceSolution -referenceSolutionFiles -hints -evaluationCriteria';

/** Strips solution/hint/evaluation fields from an IN-MEMORY document (e.g. right after .create()), where
 * `select: false` does NOT help — that option only suppresses fields on a DB query, not on a document
 * that is already fully loaded in memory. Use this instead of `doc.toObject()` for anything reaching the client. */
export function toPublicChallenge(doc: IPracticeChallenge) {
  const obj = doc.toObject() as Record<string, unknown>;
  const { referenceSolution: _s, referenceSolutionFiles: _sf, hints: _h, evaluationCriteria: _ec, ...safe } = obj;
  return { ...safe, hintCount: doc.hintCount };
}

export const PracticeChallenge = mongoose.model<IPracticeChallenge>('PracticeChallenge', PracticeChallengeSchema);
