import mongoose, { Schema, Document } from 'mongoose';

export type InterviewCategory = 'fundamentals' | 'coding' | 'debugging' | 'architecture' | 'project' | 'api' | 'database' | 'frontend' | 'backend';

export interface InterviewFollowUp {
  question: string;
  answer?: string;
  askedAt: Date;
}

export interface InterviewTurn {
  category: InterviewCategory;
  question: string;
  answer?: string;
  followUps: InterviewFollowUp[];
  askedAt: Date;
}

export interface InterviewReport {
  strengths: string[];
  weakAreas: string[];
  topicsToRevise: string[];
  recommendedChallengeIds: mongoose.Types.ObjectId[];
  summary: string;
  generatedAt: Date;
}

export interface IInterviewSession extends Document {
  userId: string;
  technology?: string;
  projectId?: mongoose.Types.ObjectId;
  status: 'active' | 'completed' | 'abandoned';
  /** Small Issue #19: an application-level mutex so two concurrent submitAnswer calls on the same session
   * can never both proceed — the second is atomically refused via findOneAndUpdate rather than racing. */
  processing: boolean;
  turns: InterviewTurn[];
  report?: InterviewReport;
  createdAt: Date;
  updatedAt: Date;
}

const FollowUpSchema = new Schema<InterviewFollowUp>({ question: { type: String, required: true }, answer: { type: String }, askedAt: { type: Date, default: Date.now } }, { _id: false });

const TurnSchema = new Schema<InterviewTurn>(
  {
    category: { type: String, required: true, enum: ['fundamentals', 'coding', 'debugging', 'architecture', 'project', 'api', 'database', 'frontend', 'backend'] },
    question: { type: String, required: true },
    answer: { type: String },
    followUps: { type: [FollowUpSchema], default: [] },
    askedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const InterviewSessionSchema = new Schema<IInterviewSession>(
  {
    userId: { type: String, required: true, index: true },
    technology: { type: String },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    status: { type: String, required: true, enum: ['active', 'completed', 'abandoned'], default: 'active', index: true },
    processing: { type: Boolean, default: false },
    turns: { type: [TurnSchema], default: [] },
    report: {
      strengths: [{ type: String }],
      weakAreas: [{ type: String }],
      topicsToRevise: [{ type: String }],
      recommendedChallengeIds: [{ type: Schema.Types.ObjectId, ref: 'PracticeChallenge' }],
      summary: { type: String },
      generatedAt: { type: Date },
    },
  },
  { timestamps: true },
);

InterviewSessionSchema.index({ userId: 1, updatedAt: -1 });

/** Safe DTO — drops the internal `processing` mutex flag, which is implementation detail the client has no
 * use for and shouldn't be able to infer timing information from (Small Issue #21). */
export function toSafeInterview(doc: IInterviewSession) {
  const obj = doc.toObject() as Record<string, unknown>;
  delete obj.processing;
  return obj;
}

export const InterviewSession = mongoose.model<IInterviewSession>('InterviewSession', InterviewSessionSchema);
