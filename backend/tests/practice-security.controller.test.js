const mongoose = require('mongoose');
const practiceController = require('../dist/controllers/practice.controller');
const interviewController = require('../dist/controllers/interview.controller');
const { projectRepository } = require('../dist/repositories/project.repository');
const { checkAttempt } = require('../dist/practice/checker');
const { geminiProvider } = require('../dist/ai/gemini.provider');

function response() {
  const res = { statusCode: 200, status: jest.fn(), json: jest.fn() };
  res.status.mockImplementation((c) => { res.statusCode = c; return res; });
  return res;
}

describe('projectId is never trusted from the client without an ownership check', () => {
  afterEach(() => jest.restoreAllMocks());

  test('GET /practice/projects/:projectId/context 404s for a project the user does not own, and never builds context for it', async () => {
    jest.spyOn(projectRepository, 'findOwnedById').mockResolvedValue(null); // simulates "exists, but belongs to someone else" and "does not exist" alike
    const req = { user: { id: 'attacker' }, params: { projectId: String(new mongoose.Types.ObjectId()) } };
    const next = jest.fn();
    await practiceController.getProjectContext(req, response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Project not found' }));
  });

  test('listing challenges with a projectId the user does not own is rejected before any challenge query runs', async () => {
    jest.spyOn(projectRepository, 'findOwnedById').mockResolvedValue(null);
    const { PracticeChallenge } = require('../dist/models/practiceChallenge.model');
    const find = jest.spyOn(PracticeChallenge, 'find');
    const req = { user: { id: 'attacker' }, query: { projectId: String(new mongoose.Types.ObjectId()) } };
    const next = jest.fn();
    await practiceController.listChallenges(req, response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Project not found' }));
    expect(find).not.toHaveBeenCalled();
  });

  test('starting a project-specific interview with an unowned projectId is rejected before any AI call', async () => {
    jest.spyOn(projectRepository, 'findOwnedById').mockResolvedValue(null);
    const generate = jest.spyOn(geminiProvider, 'generate');
    const req = { user: { id: 'attacker' }, body: { projectId: String(new mongoose.Types.ObjectId()) } };
    const next = jest.fn();
    await interviewController.startInterview(req, response(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Project not found' }));
    expect(generate).not.toHaveBeenCalled();
  });

  test('a project the user genuinely owns is allowed through to context generation', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const project = { _id: projectId, userId: 'user-a', name: 'My App', updatedAt: new Date(), languages: [] };
    jest.spyOn(projectRepository, 'findOwnedById').mockResolvedValue(project);
    const { ProjectFile } = require('../dist/models/projectFile.model');
    const { ProjectPracticeContext } = require('../dist/models/projectPracticeContext.model');
    jest.spyOn(ProjectFile, 'find').mockReturnValue({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
    jest.spyOn(ProjectPracticeContext, 'findOne').mockResolvedValue(null);
    jest.spyOn(ProjectPracticeContext, 'findOneAndUpdate').mockResolvedValue({ digest: 'x', projectId });

    const req = { user: { id: 'user-a' }, params: { projectId: String(projectId) } };
    const res = response();
    const next = jest.fn();
    await practiceController.getProjectContext(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ data: expect.objectContaining({ digest: 'x' }) });
  });
});

describe('checker — deterministic path never spends an AI call when it does not need to', () => {
  afterEach(() => jest.restoreAllMocks());

  test('output-match: exact match passes without calling Gemini', async () => {
    const generate = jest.spyOn(geminiProvider, 'generate');
    const result = await checkAttempt({
      challenge: { title: 't', instructions: 'i', expectedBehavior: '', technology: 'javascript', topic: 'x', evaluationCriteria: { kind: 'output-match', expected: '42' } },
      files: [{ path: 'a.js', content: 'console.log(42)' }],
      runOutput: '42',
    });
    expect(result.status).toBe('passed');
    expect(generate).not.toHaveBeenCalled();
  });

  test('output-match: mismatch fails without calling Gemini', async () => {
    const generate = jest.spyOn(geminiProvider, 'generate');
    const result = await checkAttempt({
      challenge: { title: 't', instructions: 'i', expectedBehavior: '', technology: 'javascript', topic: 'x', evaluationCriteria: { kind: 'output-match', expected: '42' } },
      files: [{ path: 'a.js', content: 'console.log(41)' }],
      runOutput: '41',
    });
    expect(result.status).toBe('failed');
    expect(generate).not.toHaveBeenCalled();
  });

  test('ai-only: falls back to the existing Gemini provider (no second AI integration) and parses its JSON verdict', async () => {
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    const generate = jest.spyOn(geminiProvider, 'generate').mockResolvedValue('{"status":"needs_work","feedback":"Close, but check the edge case.","strengths":["clear naming"],"issues":["off-by-one"]}');
    const result = await checkAttempt({
      challenge: { title: 't', instructions: 'i', expectedBehavior: '', technology: 'javascript', topic: 'x', evaluationCriteria: { kind: 'ai-only' } },
      files: [{ path: 'a.js', content: 'for (let i=0;i<n;i++){}' }],
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'needs_work', feedback: 'Close, but check the edge case.', strengths: ['clear naming'], issues: ['off-by-one'] });
  });

  test('ai-only: a malformed AI response never crashes and never claims "passed"', async () => {
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    jest.spyOn(geminiProvider, 'generate').mockResolvedValue('not json at all');
    const result = await checkAttempt({
      challenge: { title: 't', instructions: 'i', expectedBehavior: '', technology: 'javascript', topic: 'x', evaluationCriteria: { kind: 'ai-only' } },
      files: [{ path: 'a.js', content: 'x' }],
    });
    expect(result.status).toBe('pending');
  });
});
