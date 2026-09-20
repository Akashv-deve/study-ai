import mongoose, { Schema, Document } from 'mongoose';

export interface IProcessingJob extends Document {
  jobId: string;
  projectId: mongoose.Types.ObjectId;
  userId: string;
  status: 'queued' | 'uploading' | 'extracting' | 'scanning' | 'indexing' | 'ready' | 'failed' | 'cancelled';
  stage: string;
  progress: number;
  error?: string;
  leaseId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

const ProcessingJobSchema = new Schema<IProcessingJob>(
  {
    jobId: { type: String, required: true, unique: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    userId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['queued', 'uploading', 'extracting', 'scanning', 'indexing', 'ready', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },
    stage: { type: String, default: 'Queued' },
    progress: { type: Number, default: 0 },
    error: { type: String },
    leaseId: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

ProcessingJobSchema.index({ status: 1, createdAt: 1 });

export const ProcessingJob = mongoose.model<IProcessingJob>('ProcessingJob', ProcessingJobSchema);
