import mongoose, { Schema, Document } from 'mongoose';

export interface IFileContent extends Document {
  projectId: mongoose.Types.ObjectId;
  filePath: string;
  content: string;
  hash: string;
  size: number;
  createdAt: Date;
}

const FileContentSchema = new Schema<IFileContent>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    filePath: { type: String, required: true },
    content: { type: String, required: true },
    hash: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true }
);

FileContentSchema.index({ projectId: 1, filePath: 1 }, { unique: true });

export const FileContent = mongoose.model<IFileContent>('FileContent', FileContentSchema);
