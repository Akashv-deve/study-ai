const mongoose = require('mongoose');
const {
  generateAI,
  regenerateGeneration,
  getLatestGeneration,
  deleteGeneration,
  favoriteGeneration,
} = require('../dist/controllers/ai.controller');
const { AIGeneration } = require('../dist/models/aiGeneration.model');
const { Conversation } = require('../dist/models/conversation.model');
const { Message } = require('../dist/models/message.model');
const { FavoriteResponse } = require('../dist/models/favoriteResponse.model');
const { geminiProvider } = require('../dist/ai/gemini.provider');
const { projectRepository } = require('../dist/repositories/project.repository');
const contextBuilder = require('../dist/ai/contextBuilder');

function response() {
  const res = { headersSent: false, status: jest.fn(), setHeader: jest.fn(), flushHeaders: jest.fn(), write: jest.fn(), end: jest.fn(), on: jest.fn(), off: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

async function* oneChunk(text) { yield text; }

describe('regeneration conversation reference', () => {
  afterEach(() => jest.restoreAllMocks());

  test('the conversation is repointed to the new generation, never left referencing the deleted old one', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    const userId = 'user-a';
    const originalId = new mongoose.Types.ObjectId();
    const conversationId = new mongoose.Types.ObjectId();
    const newId = new mongoose.Types.ObjectId();
    const requestMessageId = new mongoose.Types.ObjectId();

    jest.spyOn(projectRepository, 'findOwnedById').mockResolvedValue({ _id: projectId });
    jest.spyOn(contextBuilder, 'buildContext').mockResolvedValue('');
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    jest.spyOn(geminiProvider, 'generateStream').mockImplementation(() => oneChunk('new answer'));

    // The generation being regenerated. regenerateGeneration() reads it via `.findOne(...).lean()`;
    // generateAI() reads the *same* mocked call directly via `await findOne(...)` (no .lean()). A thenable
    // that also exposes .lean() satisfies both call shapes.
    const originalDoc = { _id: originalId, userId, projectId, filePath: 'src/app.ts', selection: undefined, contextKey: 'src/app.ts', title: 'old title' };
    jest.spyOn(AIGeneration, 'findOne').mockReturnValue({ then: (resolve) => resolve(originalDoc), lean: async () => originalDoc });
    // The conversation still points at the (about-to-be-superseded) original generation.
    const conversationDoc = { _id: conversationId, userId, projectId, generationId: originalId };
    jest.spyOn(Conversation, 'findOne').mockResolvedValue(conversationDoc);
    const conversationCreate = jest.spyOn(Conversation, 'create');

    jest.spyOn(Message, 'create')
      .mockResolvedValueOnce({ _id: requestMessageId, conversationId })
      .mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId(), conversationId });
    jest.spyOn(Message, 'updateOne').mockResolvedValue({});
    jest.spyOn(Message, 'countDocuments').mockResolvedValue(2); // request + assistant messages still exist
    const messageDeleteMany = jest.spyOn(Message, 'deleteMany').mockResolvedValue({ deletedCount: 1 });

    jest.spyOn(AIGeneration, 'create').mockResolvedValue({ _id: newId, title: 'new answer'.slice(0, 120) });
    // The original generation is the "previous" ordinary response for the same context.
    jest.spyOn(AIGeneration, 'find').mockReturnValue({ select: () => ({ lean: async () => [{ _id: originalId, conversationId }] }) });
    const generationDeleteMany = jest.spyOn(AIGeneration, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
    const generationExists = jest.spyOn(AIGeneration, 'exists');

    const conversationUpdateOne = jest.spyOn(Conversation, 'updateOne').mockResolvedValue({});
    const conversationDeleteOne = jest.spyOn(Conversation, 'deleteOne').mockResolvedValue({ deletedCount: 1 });

    const req = { user: { id: userId }, params: { id: String(originalId) }, body: {} };
    const res = response();
    await regenerateGeneration(req, res, jest.fn());

    // Conversation.generationId now points at the NEW generation, not the deleted original.
    expect(conversationUpdateOne).toHaveBeenCalledWith(
      { _id: conversationId, userId, projectId },
      { $set: { generationId: newId, title: expect.any(String) } },
    );
    // The old generation (and its messages) were actually removed, not just orphaned.
    expect(generationDeleteMany).toHaveBeenCalledWith({ _id: { $in: [originalId] }, userId, projectId });
    expect(messageDeleteMany).toHaveBeenCalledWith({ 'metadata.generationId': { $in: [originalId] } });
    // The still-populated conversation is not deleted.
    expect(conversationDeleteOne).not.toHaveBeenCalled();
    // Short-circuit: since the current ref was already in the "removed" set, exists() need not run.
    expect(generationExists).not.toHaveBeenCalled();
    expect(conversationCreate).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });
});

describe('ordinary response replacement vs. favorite independence', () => {
  afterEach(() => jest.restoreAllMocks());

  test('a new response for the same context deletes the previous ordinary generation, but never touches a favorited snapshot of it', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    const userId = 'user-a';
    const previousId = new mongoose.Types.ObjectId();
    const conversationId = new mongoose.Types.ObjectId();
    const newId = new mongoose.Types.ObjectId();

    jest.spyOn(projectRepository, 'findOwnedById').mockResolvedValue({ _id: projectId });
    jest.spyOn(contextBuilder, 'buildContext').mockResolvedValue('');
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    jest.spyOn(geminiProvider, 'generateStream').mockImplementation(() => oneChunk('second answer'));

    jest.spyOn(AIGeneration, 'findOne').mockResolvedValue(null); // fresh request, not a regenerate
    jest.spyOn(Conversation, 'findOne').mockResolvedValue(null);
    jest.spyOn(Conversation, 'create').mockResolvedValue({ _id: conversationId, userId, projectId, generationId: undefined });
    jest.spyOn(Message, 'create')
      .mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId(), conversationId })
      .mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId(), conversationId });
    jest.spyOn(Message, 'updateOne').mockResolvedValue({});
    jest.spyOn(Message, 'countDocuments').mockResolvedValue(0);
    const messageDeleteMany = jest.spyOn(Message, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
    jest.spyOn(Conversation, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
    jest.spyOn(Conversation, 'updateOne').mockResolvedValue({});

    jest.spyOn(AIGeneration, 'create').mockResolvedValue({ _id: newId, title: 'second answer' });
    jest.spyOn(AIGeneration, 'find').mockReturnValue({ select: () => ({ lean: async () => [{ _id: previousId, conversationId }] }) });
    const generationDeleteMany = jest.spyOn(AIGeneration, 'deleteMany').mockResolvedValue({ deletedCount: 1 });

    // These must never be called while cleaning up an ordinary superseded generation.
    const favoriteDeleteMany = jest.spyOn(FavoriteResponse, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    const favoriteFindOneAndDelete = jest.spyOn(FavoriteResponse, 'findOneAndDelete').mockResolvedValue(null);

    const req = { user: { id: userId }, body: { projectId, prompt: 'Explain again', filePath: 'src/app.ts' } };
    const res = response();
    await generateAI(req, res, jest.fn());

    expect(generationDeleteMany).toHaveBeenCalledWith({ _id: { $in: [previousId] }, userId, projectId });
    expect(messageDeleteMany).toHaveBeenCalledWith({ 'metadata.generationId': { $in: [previousId] } });
    expect(favoriteDeleteMany).not.toHaveBeenCalled();
    expect(favoriteFindOneAndDelete).not.toHaveBeenCalled();
  });

  test('favoriting copies a self-contained snapshot (content, not a live reference to the source generation)', async () => {
    const userId = 'user-a';
    const generationId = new mongoose.Types.ObjectId();
    const projectId = new mongoose.Types.ObjectId();
    jest.spyOn(AIGeneration, 'findOne').mockReturnValue({ lean: async () => ({ _id: generationId, userId, projectId, title: 'Explain foo.ts', content: 'the full explanation text', type: 'file_explanation', filePath: 'src/foo.ts', modelName: 'gemini-3.6-flash' }) });
    jest.spyOn(projectRepository, 'findOwnedById').mockResolvedValue({ _id: projectId, name: 'Portfolio Builder' });
    const upsert = jest.spyOn(FavoriteResponse, 'findOneAndUpdate').mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

    const req = { user: { id: userId }, params: { id: String(generationId) } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await favoriteGeneration(req, res, jest.fn());

    expect(upsert).toHaveBeenCalledWith(
      { userId, sourceGenerationId: generationId },
      { $setOnInsert: expect.objectContaining({ content: 'the full explanation text', title: 'Explain foo.ts', filePath: 'src/foo.ts' }) },
      { upsert: true, new: true },
    );
  });

  test('deleting the source generation never reaches FavoriteResponse (the favorite survives structurally, not by luck)', async () => {
    const userId = 'user-a';
    const generationId = new mongoose.Types.ObjectId();
    const conversationId = new mongoose.Types.ObjectId();
    jest.spyOn(AIGeneration, 'findOneAndDelete').mockResolvedValue({ _id: generationId, userId, conversationId, projectId: new mongoose.Types.ObjectId() });
    jest.spyOn(Message, 'deleteMany').mockResolvedValue({ deletedCount: 2 });
    jest.spyOn(Conversation, 'updateMany').mockResolvedValue({});
    jest.spyOn(Message, 'countDocuments').mockResolvedValue(0);
    jest.spyOn(Conversation, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
    const favoriteDeleteMany = jest.spyOn(FavoriteResponse, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    const favoriteFindOneAndDelete = jest.spyOn(FavoriteResponse, 'findOneAndDelete').mockResolvedValue(null);

    const req = { user: { id: userId }, params: { id: String(generationId) } };
    const res = { json: jest.fn() };
    await deleteGeneration(req, res, jest.fn());

    expect(favoriteDeleteMany).not.toHaveBeenCalled();
    expect(favoriteFindOneAndDelete).not.toHaveBeenCalled();
  });
});

describe('context-aware generation retrieval', () => {
  afterEach(() => jest.restoreAllMocks());

  test('getLatestGeneration filters by the exact contextKey, so a selection response can never surface as the whole-file response', async () => {
    const userId = 'user-a';
    const projectId = new mongoose.Types.ObjectId().toString();
    const findOne = jest.fn().mockReturnValue({ sort: () => ({ lean: async () => ({ _id: new mongoose.Types.ObjectId(), contextKey: 'src/foo.ts:20-35', content: 'selection answer' }) }) });
    jest.spyOn(AIGeneration, 'findOne').mockImplementation(findOne);
    jest.spyOn(projectRepository, 'findOwnedById').mockResolvedValue({ _id: projectId });
    jest.spyOn(FavoriteResponse, 'exists').mockResolvedValue(false);

    const req = { user: { id: userId }, params: { projectId }, query: { contextKey: 'src/foo.ts:20-35' } };
    const res = { json: jest.fn() };
    await getLatestGeneration(req, res, jest.fn());

    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ userId, projectId, isActive: true, contextKey: 'src/foo.ts:20-35' }));
    expect(res.json).toHaveBeenCalledWith({ data: expect.objectContaining({ contextKey: 'src/foo.ts:20-35', content: 'selection answer' }) });
  });

  test('an unrecognized/omitted contextKey does not silently fall back to matching every context', async () => {
    const userId = 'user-a';
    const projectId = new mongoose.Types.ObjectId().toString();
    const findOne = jest.fn().mockReturnValue({ sort: () => ({ lean: async () => null }) });
    jest.spyOn(AIGeneration, 'findOne').mockImplementation(findOne);
    jest.spyOn(projectRepository, 'findOwnedById').mockResolvedValue({ _id: projectId });

    const req = { user: { id: userId }, params: { projectId }, query: {} };
    const res = { json: jest.fn() };
    await getLatestGeneration(req, res, jest.fn());

    const filter = findOne.mock.calls[0][0];
    expect(filter).not.toHaveProperty('contextKey');
    expect(res.json).toHaveBeenCalledWith({ data: null });
  });
});
