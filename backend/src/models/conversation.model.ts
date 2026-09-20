import mongoose, { Schema, Document } from 'mongoose';

export interface IConversation extends Document {
  userId: string;
  projectId: mongoose.Types.ObjectId;
  generationId?: mongoose.Types.ObjectId;
  type: string;
  title: string;
  context?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    userId: { type: String, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    generationId: { type: Schema.Types.ObjectId, ref: 'AIGeneration' },
    type: { type: String, default: 'contextual' },
    title: { type: String, required: true },
    context: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);
