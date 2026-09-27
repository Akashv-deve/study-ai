const mongoose = require('mongoose');
const attemptService = require('../dist/practice/attemptService');
const challengeService = require('../dist/practice/challengeService');
const progressService = require('../dist/practice/progressService');
const { PracticeAttempt } = require('../dist/models/practiceAttempt.model');
const { PracticeChallenge } = require('../dist/models/practiceChallenge.model');

function challengeDoc(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    technology: 'javascript',
    hints: ['Look at the loop bounds.', 'Off-by-one on the upper bound.', 'Change < to <=.'],
    hintCount: 3,
    referenceSolution: 'for (let i = 0; i <= n; i++) { ... }',
    referenceSolutionFiles: [{ path: 'solution.js', content: 'for (let i = 0; i <= n; i++) {}' }],
    starterFiles: [{ path: 'index.js', content: '// start here' }],
    ...overrides,
  };
}

describe('hint progression (cannot skip levels, never over-reveals)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns exactly hint 1, then hint 2, then hint 3 in order, and refuses a 4th request', async () => {
    const userId = 'user-a';
    const attemptId = new mongoose.Types.ObjectId();
    const challenge = challengeDoc();
    let hintsUsed = 0;
    jest.spyOn(PracticeAttempt, 'findOne').mockReturnValue({ select: () => Promise.resolve({ _id: attemptId, userId, challengeId: challenge._id, status: 'in_progress' }) });
    jest.spyOn(PracticeChallenge, 'findById').mockReturnValue({ select: () => Promise.resolve(challenge) });
    jest.spyOn(PracticeAttempt, 'findOneAndUpdate').mockImplementation(async (filter) => {
      if (filter.hintsUsed.$lt <= hintsUsed) return null;
      hintsUsed += 1;
      return { hintsUsed };
    });

    const first = await attemptService.requestHint(String(attemptId), userId);
    expect(first).toEqual({ hint: challenge.hints[0], hintLevel: 1, hintsRemaining: 2 });

    const second = await attemptService.requestHint(String(attemptId), userId);
    expect(second).toEqual({ hint: challenge.hints[1], hintLevel: 2, hintsRemaining: 1 });

    const third = await attemptService.requestHint(String(attemptId), userId);
    expect(third).toEqual({ hint: challenge.hints[2], hintLevel: 3, hintsRemaining: 0 });

    await expect(attemptService.requestHint(String(attemptId), userId)).rejects.toThrow('No more hints available');
  });
});

describe('reference solution protection', () => {
  afterEach(() => jest.restoreAllMocks());

  test('the public challenge query excludes referenceSolution, referenceSolutionFiles, hints, and evaluationCriteria', async () => {
    const select = jest.fn().mockReturnValue({ lean: async () => ({ title: 'x' }) });
    jest.spyOn(PracticeChallenge, 'findOne').mockReturnValue({ select });
    await challengeService.getChallengePublic(String(new mongoose.Types.ObjectId()), 'user-a');
    expect(select).toHaveBeenCalledWith('-referenceSolution -referenceSolutionFiles -hints -evaluationCriteria');
  });

  test('revealing the solution requires an owned, in-progress attempt with every hint used, and only then returns it', async () => {
    const userId = 'user-a';
    const attemptId = new mongoose.Types.ObjectId();
    const challenge = challengeDoc();
    const attemptDoc = { _id: attemptId, userId, challengeId: challenge._id, status: 'in_progress', hintsUsed: 3, solutionRevealed: false, save: jest.fn().mockResolvedValue(undefined) };
    jest.spyOn(PracticeAttempt, 'findOne').mockResolvedValue(attemptDoc);
    const select = jest.fn().mockResolvedValue(challenge);
    jest.spyOn(PracticeChallenge, 'findById').mockReturnValue({ select });

    const result = await attemptService.revealSolution(String(attemptId), userId);

    expect(select).toHaveBeenCalledWith('+referenceSolution +referenceSolutionFiles hintCount');
    expect(result.referenceSolution).toBe(challenge.referenceSolution);
    expect(attemptDoc.solutionRevealed).toBe(true);
    expect(attemptDoc.save).toHaveBeenCalled();
  });

  test('reveal is refused until every hint has been used (Issue #8: cannot skip the hint ladder)', async () => {
    const userId = 'user-a';
    const attemptId = new mongoose.Types.ObjectId();
    const challenge = challengeDoc();
    const attemptDoc = { _id: attemptId, userId, challengeId: challenge._id, status: 'in_progress', hintsUsed: 1, solutionRevealed: false, save: jest.fn() };
    jest.spyOn(PracticeAttempt, 'findOne').mockResolvedValue(attemptDoc);
    jest.spyOn(PracticeChallenge, 'findById').mockReturnValue({ select: async () => challenge });

    await expect(attemptService.revealSolution(String(attemptId), userId)).rejects.toThrow('Use all 3 hints');
    expect(attemptDoc.save).not.toHaveBeenCalled();
  });
});

describe('attempt ownership', () => {
  afterEach(() => jest.restoreAllMocks());

  test('a user cannot load another user\'s attempt (scoped query returns null -> NotFoundError, not the data)', async () => {
    jest.spyOn(PracticeAttempt, 'findOne').mockResolvedValue(null);
    await expect(attemptService.getAttempt(String(new mongoose.Types.ObjectId()), 'someone-else')).rejects.toThrow('Attempt not found');
  });

  test('getOrCreateAttempt never creates an attempt for a challenge outside the ownership/visibility filter', async () => {
    jest.spyOn(PracticeChallenge, 'findOne').mockResolvedValue(null);
    const create = jest.spyOn(PracticeAttempt, 'create');
    await expect(attemptService.getOrCreateAttempt(String(new mongoose.Types.ObjectId()), 'user-a')).rejects.toThrow('Challenge not found');
    expect(create).not.toHaveBeenCalled();
  });

  test('an existing in-progress attempt is reused (refreshing the browser does not destroy it)', async () => {
    const userId = 'user-a';
    const challenge = challengeDoc();
    jest.spyOn(PracticeChallenge, 'findOne').mockResolvedValue(challenge);
    const existingAttempt = { _id: new mongoose.Types.ObjectId(), userId, challengeId: challenge._id, status: 'in_progress', files: [{ path: 'index.js', content: 'my in-progress work' }] };
    jest.spyOn(PracticeAttempt, 'findOne').mockReturnValue({ sort: () => Promise.resolve(existingAttempt) });
    const create = jest.spyOn(PracticeAttempt, 'create');

    const result = await attemptService.getOrCreateAttempt(String(challenge._id), userId);

    expect(result).toBe(existingAttempt);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('progress is derived from actual attempts, never fabricated', () => {
  afterEach(() => jest.restoreAllMocks());

  function mockAggregate(byTechnology, byTopic, totals) {
    return jest.spyOn(PracticeAttempt, 'aggregate').mockResolvedValue([{ byTechnology, byTopic, totals: totals ? [totals] : [] }]);
  }
  function mockRecent(rows) {
    jest.spyOn(PracticeAttempt, 'find').mockReturnValue({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) }) });
  }

  test('a user with zero attempts gets all zeros, not placeholder numbers', async () => {
    mockAggregate([], [], undefined);
    mockRecent([]);
    const { InterviewSession } = require('../dist/models/interviewSession.model');
    jest.spyOn(InterviewSession, 'countDocuments').mockResolvedValue(0);

    const summary = await progressService.getProgressSummary('brand-new-user');

    expect(summary.totals).toEqual({ challengesAttempted: 0, challengesSolved: 0, totalAttempts: 0, hintsUsed: 0, solutionsRevealed: 0, interviewSessions: 0 });
    expect(summary.byTechnology).toEqual([]);
    expect(summary.weakTopics).toEqual([]);
  });

  test('passes through the aggregation pipeline\'s per-technology rollup (2 real attempts, same challenge -> 1 attempted, 2 total)', async () => {
    mockAggregate(
      [{ technology: 'javascript', attempted: 1, solved: 1, totalAttempts: 2, hintsUsed: 4, solutionsRevealed: 1 }],
      [{ topic: 'loops', attempted: 1, solved: 1 }],
      { challengesAttempted: 1, challengesSolved: 1, totalAttempts: 2, hintsUsed: 4, solutionsRevealed: 1 },
    );
    mockRecent([]);
    const { InterviewSession } = require('../dist/models/interviewSession.model');
    jest.spyOn(InterviewSession, 'countDocuments').mockResolvedValue(0);

    const summary = await progressService.getProgressSummary('user-a');

    expect(summary.byTechnology).toEqual([{ technology: 'javascript', attempted: 1, solved: 1, totalAttempts: 2, hintsUsed: 4, solutionsRevealed: 1 }]);
    expect(summary.totals).toMatchObject({ challengesAttempted: 1, challengesSolved: 1, totalAttempts: 2 });
  });

  test('a topic with a low solve rate is flagged weak; a fully-solved topic is not', async () => {
    mockAggregate([], [{ topic: 'recursion', attempted: 2, solved: 0 }, { topic: 'loops', attempted: 1, solved: 1 }], undefined);
    mockRecent([]);
    const { InterviewSession } = require('../dist/models/interviewSession.model');
    jest.spyOn(InterviewSession, 'countDocuments').mockResolvedValue(0);

    const summary = await progressService.getProgressSummary('user-a');

    expect(summary.weakTopics).toEqual(['recursion']);
  });

  test('recentActivity stays bounded to the query\'s own limit regardless of total history size', async () => {
    mockAggregate([], [], undefined);
    const rows = Array.from({ length: 10 }, (_, i) => ({ _id: new mongoose.Types.ObjectId(), challengeId: new mongoose.Types.ObjectId(), attemptNumber: 1, status: 'passed', updatedAt: new Date() }));
    mockRecent(rows);
    jest.spyOn(PracticeChallenge, 'find').mockReturnValue({ select: () => ({ lean: async () => [] }) });
    const { InterviewSession } = require('../dist/models/interviewSession.model');
    jest.spyOn(InterviewSession, 'countDocuments').mockResolvedValue(0);

    const summary = await progressService.getProgressSummary('user-a');
    expect(summary.recentActivity).toHaveLength(10);
  });
});
