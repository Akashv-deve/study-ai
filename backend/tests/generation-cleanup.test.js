const mongoose = require('mongoose');
const { generateAI } = require('../dist/controllers/ai.controller');
const { AIGeneration } = require('../dist/models/aiGeneration.model');
const { Conversation } = require('../dist/models/conversation.model');
const { Message } = require('../dist/models/message.model');
const { geminiProvider } = require('../dist/ai/gemini.provider');
const { projectRepository } = require('../dist/repositories/project.repository');
const contextBuilder = require('../dist/ai/contextBuilder');

function response() {
  const res = { headersSent: false, status: jest.fn(), setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('failed AI generation cleanup', () => {
  afterEach(() => jest.restoreAllMocks());

  test('removes only the failed request message and its newly-created empty conversation', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    const conversationId = new mongoose.Types.ObjectId();
    const messageId = new mongoose.Types.ObjectId();
    jest.spyOn(projectRepository, 'findOwnedById').mockResolvedValue({ _id: projectId });
    jest.spyOn(contextBuilder, 'buildContext').mockResolvedValue('');
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    jest.spyOn(AIGeneration, 'findOne').mockResolvedValue(null);
    jest.spyOn(Conversation, 'create').mockResolvedValue({ _id: conversationId });
    jest.spyOn(Message, 'create').mockResolvedValue({ _id: messageId, conversationId });
    jest.spyOn(Message, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
    jest.spyOn(Message, 'countDocuments').mockResolvedValue(0);
    const deleteConversation = jest.spyOn(Conversation, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
    jest.spyOn(geminiProvider, 'generateStream').mockImplementation(async function* () { throw new Error('AI provider request failed'); });

    const req = { user: { id: 'user-a' }, body: { projectId, prompt: 'Explain this project' } };
    const res = response();
    await generateAI(req, res, jest.fn());

    expect(Message.deleteOne).toHaveBeenCalledWith({ _id: messageId, conversationId });
    expect(deleteConversation).toHaveBeenCalledWith({ _id: conversationId, userId: 'user-a', projectId });
    expect(res.end).toHaveBeenCalled();
  });
});
