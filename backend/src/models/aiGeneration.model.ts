import mongoose, { Schema, Document } from 'mongoose';

export interface IAIGeneration {
  userId: string;
  projectId: mongoose.Types.ObjectId;
  conversationId?: mongoose.Types.ObjectId;
  type: string;
  title: string;
  promptSummary?: string;
  context?: Record<string, unknown>;
  content: string;
  language?: string;
  filePath?: string;
  selection?: { code: string; startLine?: number; endLine?: number };
  modelName: string;
  provider: string;
  status: 'streaming' | 'completed' | 'failed' | 'partial' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const AIGenerationSchema = new Schema<IAIGeneration>(
  {
    userId: { type: String, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
    type: { type: String, required: true },
    title: { type: String, required: true },
    promptSummary: { type: String },
    context: { type: Schema.Types.Mixed },
    content: { type: String, required: true },
    language: { type: String },
    filePath: { type: String },
    selection: { type: Schema.Types.Mixed },
    modelName: { type: String, required: true },
    provider: { type: String, default: 'gemini' },
    status: { type: String, enum: ['streaming', 'completed', 'failed', 'partial', 'cancelled'], default: 'completed' },
  },
  { timestamps: true }
);

AIGenerationSchema.index({ userId: 1, projectId: 1, createdAt: -1 });

export const AIGeneration = mongoose.model<IAIGeneration>('AIGeneration', AIGenerationSchema);
