import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityEvent extends Document {
  userId: string;
  projectId?: mongoose.Types.ObjectId;
  type: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const ActivityEventSchema = new Schema<IActivityEvent>(
  {
    userId: { type: String, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    type: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const ActivityEvent = mongoose.model<IActivityEvent>('ActivityEvent', ActivityEventSchema);
