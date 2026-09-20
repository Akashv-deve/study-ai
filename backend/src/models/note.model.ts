import mongoose, { Schema, Document } from 'mongoose';

export interface INote extends Document {
  userId: string;
  projectId?: mongoose.Types.ObjectId;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  generationId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NoteSchema = new Schema<INote>(
  {
    userId: { type: String, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    tags: [{ type: String }],
    pinned: { type: Boolean, default: false },
    generationId: { type: Schema.Types.ObjectId, ref: 'AIGeneration' },
  },
  { timestamps: true }
);

export const Note = mongoose.model<INote>('Note', NoteSchema);
