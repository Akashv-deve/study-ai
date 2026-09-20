import { Project, IProject } from '../models/project.model';
import { ProjectFile } from '../models/projectFile.model';
import { FileContent } from '../models/fileContent.model';
import { ProcessingJob } from '../models/processingJob.model';
import { AIGeneration } from '../models/aiGeneration.model';
import { Conversation } from '../models/conversation.model';
import { Message } from '../models/message.model';
import { FavoriteResponse } from '../models/favoriteResponse.model';
import { ActivityEvent } from '../models/activityEvent.model';
import mongoose from 'mongoose';

export class ProjectRepository {
  async create(data: Partial<IProject>): Promise<IProject> {
    return await Project.create(data);
  }

  async findById(id: string): Promise<IProject | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await Project.findById(id);
  }

  async findOwnedById(id: string, userId: string): Promise<IProject | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Project.findOne({ _id: id, userId });
  }

  async findByUserId(userId: string): Promise<IProject[]> {
    return await Project.find({ userId }).sort({ createdAt: -1 });
  }

  async updateStatus(id: string, status: IProject['processingStatus'], jobId?: string): Promise<IProject | null> {
    return await Project.findByIdAndUpdate(id, { processingStatus: status, ...(jobId ? { processingJobId: jobId } : {}) }, { new: true });
  }

  async updateOwned(id: string, userId: string, data: Pick<IProject, 'name' | 'description'>): Promise<IProject | null> {
    return Project.findOneAndUpdate({ _id: id, userId }, data, { new: true, runValidators: true });
  }

  async clearPartialIndex(id: string, userId: string): Promise<boolean> {
    const project = await Project.findOne({ _id: id, userId });
    if (!project) return false;
    await Promise.all([
      ProjectFile.deleteMany({ projectId: project._id }),
      FileContent.deleteMany({ projectId: project._id }),
    ]);
    project.fileCount = 0;
    project.analyzableFileCount = 0;
    project.languages = [];
    project.frameworks = [];
    project.mainLanguage = undefined;
    project.scanLimits = { reached: false, reasons: [], scannedFileCount: 0, analyzedFileCount: 0 };
    await project.save();
    return true;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const project = await Project.findOne({ _id: id, userId });
    if (!project) return false;
    // Mark jobs cancelled before removing the project. A worker verifies the project
    // exists before indexing, so a stale claimed job cannot recreate child records.
    await ProcessingJob.updateMany({ projectId: id, userId, status: { $in: ['queued', 'uploading', 'extracting', 'scanning', 'indexing'] } }, { status: 'cancelled', stage: 'Project deleted', completedAt: new Date() });
    const conversations = await Conversation.find({ projectId: id, userId }).select('_id').lean();
    const conversationIds = conversations.map((conversation) => conversation._id);
    await Promise.all([
      Message.deleteMany({ conversationId: { $in: conversationIds } }),
      Conversation.deleteMany({ projectId: id, userId }),
      AIGeneration.deleteMany({ projectId: id, userId }),
      // Favourites are durable snapshots. Keep their readable content after project removal,
      // but remove the live project link so the UI cannot offer a broken protected route.
      FavoriteResponse.updateMany({ projectId: id, userId }, { $set: { projectDeletedAt: new Date() }, $unset: { projectId: '' } }),
      ActivityEvent.deleteMany({ projectId: id, userId }),
      ProjectFile.deleteMany({ projectId: id }),
      FileContent.deleteMany({ projectId: id }),
    ]);
    await Project.deleteOne({ _id: id, userId });
    await ProcessingJob.deleteMany({ projectId: id, userId });
    return true;
  }
}

export const projectRepository = new ProjectRepository();
