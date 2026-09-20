import mongoose, { Document, Schema } from 'mongoose';

/** A favourite is a self-contained snapshot: deleting/replacing its source never loses it. */
export interface IFavoriteResponse extends Document {
  userId: string;
  projectId?: mongoose.Types.ObjectId;
  projectName: string;
  projectDeletedAt?: Date;
  sourceGenerationId?: mongoose.Types.ObjectId;
  title: string;
  content: string;
  type: string;
  filePath?: string;
  selection?: { code: string; startLine?: number; endLine?: number };
  modelName: string;
  createdAt: Date;
  updatedAt: Date;
}

const FavoriteResponseSchema = new Schema<IFavoriteResponse>({
  userId: { type: String, required: true, index: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
  projectName: { type: String, required: true },
  projectDeletedAt: { type: Date },
  sourceGenerationId: { type: Schema.Types.ObjectId, ref: 'AIGeneration' },
  title: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, required: true },
  filePath: { type: String },
  selection: { type: Schema.Types.Mixed },
  modelName: { type: String, required: true },
}, { timestamps: true });

FavoriteResponseSchema.index({ userId: 1, createdAt: -1 });
FavoriteResponseSchema.index({ userId: 1, sourceGenerationId: 1 }, { unique: true, sparse: true });

export const FavoriteResponse = mongoose.model<IFavoriteResponse>('FavoriteResponse', FavoriteResponseSchema);
