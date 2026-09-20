const mongoose = require('mongoose');
const { Project } = require('../dist/models/project.model');
const { ProcessingJob } = require('../dist/models/processingJob.model');
const { ProjectFile } = require('../dist/models/projectFile.model');
const { FileContent } = require('../dist/models/fileContent.model');
const { AIGeneration } = require('../dist/models/aiGeneration.model');
const { Conversation } = require('../dist/models/conversation.model');
const { Message } = require('../dist/models/message.model');
const { ActivityEvent } = require('../dist/models/activityEvent.model');
const { ProjectRepository } = require('../dist/repositories/project.repository');

describe('ownership and deletion guards', () => {
  afterEach(() => jest.restoreAllMocks());

  test('project lookup includes the authenticated owner', async () => {
    const findOne = jest.spyOn(Project, 'findOne').mockResolvedValue(null);
    const repository = new ProjectRepository();
    await repository.findOwnedById(new mongoose.Types.ObjectId().toString(), 'user-a');
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a' }));
  });

  test('deletion cancels active jobs before removing dependent data', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    jest.spyOn(Project, 'findOne').mockResolvedValue({ _id: projectId });
    const updateMany = jest.spyOn(ProcessingJob, 'updateMany').mockResolvedValue({});
    jest.spyOn(ProcessingJob, 'deleteMany').mockResolvedValue({});
    jest.spyOn(Conversation, 'find').mockReturnValue({ select: () => ({ lean: async () => [] }) });
    for (const model of [ProjectFile, FileContent, AIGeneration, Conversation, Message, ActivityEvent]) {
      jest.spyOn(model, 'deleteMany').mockResolvedValue({});
    }
    jest.spyOn(Project, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
    const repository = new ProjectRepository();
    await repository.delete(projectId, 'user-a');
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ projectId, userId: 'user-a' }), expect.objectContaining({ status: 'cancelled' }));
  });
});
