import mongoose, { Schema, Document } from 'mongoose';

export interface IProjectFile extends Document {
  projectId: mongoose.Types.ObjectId;
  path: string;
  name: string;
  directory: string;
  extension: string;
  language: string;
  size: number;
  hash: string;
  isBinary: boolean;
  isAnalyzable: boolean;
  isAnalyzed: boolean;
  analysisStatus: 'analyzed' | 'skipped_binary' | 'skipped_file_size' | 'skipped_total_bytes' | 'skipped_analysis_limit';
  contentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectFileSchema = new Schema<IProjectFile>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    path: { type: String, required: true },
    name: { type: String, required: true },
    directory: { type: String, required: true },
    extension: { type: String, required: true },
    language: { type: String, required: true },
    size: { type: Number, required: true },
    hash: { type: String, required: true },
    isBinary: { type: Boolean, default: false },
    isAnalyzable: { type: Boolean, default: true },
    isAnalyzed: { type: Boolean, default: false },
    analysisStatus: { type: String, enum: ['analyzed', 'skipped_binary', 'skipped_file_size', 'skipped_total_bytes', 'skipped_analysis_limit'], required: true },
    contentId: { type: String },
  },
  { timestamps: true }
);

ProjectFileSchema.index({ projectId: 1, path: 1 }, { unique: true });
ProjectFileSchema.index({ projectId: 1, language: 1 });

export const ProjectFile = mongoose.model<IProjectFile>('ProjectFile', ProjectFileSchema);
