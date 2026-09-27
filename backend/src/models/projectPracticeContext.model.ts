import mongoose, { Schema, Document } from 'mongoose';

/**
 * A bounded, evidence-backed digest of one project — never invented. Every field here must trace back to
 * something actually observed in the project's own files (package.json dependencies, import statements,
 * route declarations, schema definitions). Rebuilt whenever the project's file set changes; cheap to check
 * staleness via `builtFromUpdatedAt` against the live Project.updatedAt.
 */
export interface EvidenceRef {
  file: string;
  detail: string;
}

export interface IProjectPracticeContext extends Document {
  projectId: mongoose.Types.ObjectId;
  userId: string;
  detectedTechnologies: { name: string; evidence: EvidenceRef[] }[];
  keyFiles: string[];
  apiPatterns: EvidenceRef[];
  databasePatterns: EvidenceRef[];
  architecturalNotes: string[];
  suggestedTopics: string[];
  digest: string; // the bounded text actually sent to Gemini for challenge/interview generation
  builtFromUpdatedAt: Date; // Project.updatedAt at the time this was built, for staleness checks
  builtFromFileCount: number; // Project.fileCount at build time — a second real signal, catches reprocessing that changes files without touching updatedAt
  createdAt: Date;
  updatedAt: Date;
}

const EvidenceRefSchema = new Schema<EvidenceRef>({ file: { type: String, required: true }, detail: { type: String, required: true } }, { _id: false });

const ProjectPracticeContextSchema = new Schema<IProjectPracticeContext>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    detectedTechnologies: [{ name: { type: String, required: true }, evidence: [EvidenceRefSchema] }],
    keyFiles: [{ type: String }],
    apiPatterns: [EvidenceRefSchema],
    databasePatterns: [EvidenceRefSchema],
    architecturalNotes: [{ type: String }],
    suggestedTopics: [{ type: String }],
    digest: { type: String, required: true },
    builtFromUpdatedAt: { type: Date, required: true },
    builtFromFileCount: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

export const ProjectPracticeContext = mongoose.model<IProjectPracticeContext>('ProjectPracticeContext', ProjectPracticeContextSchema);
