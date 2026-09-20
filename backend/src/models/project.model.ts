import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  userId: string;
  name: string;
  description?: string;
  sourceType: 'zip' | 'github';
  sourceMetadata?: Record<string, unknown>;
  processingStatus: 'queued' | 'uploading' | 'extracting' | 'scanning' | 'indexing' | 'ready' | 'failed' | 'cancelled';
  processingJobId?: string;
  languages: string[];
  frameworks: string[];
  fileCount: number;
  analyzableFileCount: number;
  mainLanguage?: string;
  projectType?: string;
  scanLimits?: { reached: boolean; reasons: string[]; scannedFileCount: number; analyzedFileCount: number };
  defaultBranch?: string;
  commitSha?: string;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    sourceType: { type: String, enum: ['zip', 'github'], required: true },
    sourceMetadata: { type: Schema.Types.Mixed },
    processingStatus: {
      type: String,
      enum: ['queued', 'uploading', 'extracting', 'scanning', 'indexing', 'ready', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },
    processingJobId: { type: String },
    languages: [{ type: String }],
    frameworks: [{ type: String }],
    fileCount: { type: Number, default: 0 },
    analyzableFileCount: { type: Number, default: 0 },
    mainLanguage: { type: String },
    projectType: { type: String },
    scanLimits: {
      reached: { type: Boolean, default: false },
      reasons: [{ type: String }],
      scannedFileCount: { type: Number, default: 0 },
      analyzedFileCount: { type: Number, default: 0 },
    },
    defaultBranch: { type: String },
    commitSha: { type: String },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true }
);

ProjectSchema.index({ userId: 1, createdAt: -1 });
ProjectSchema.index({ userId: 1, name: 1 });

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
