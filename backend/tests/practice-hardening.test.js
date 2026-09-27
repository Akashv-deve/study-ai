const mongoose = require('mongoose');
const attemptService = require('../dist/practice/attemptService');
const challengeService = require('../dist/practice/challengeService');
const { checkAttempt } = require('../dist/practice/checker');
const { PracticeAttempt } = require('../dist/models/practiceAttempt.model');
const { PracticeChallenge } = require('../dist/models/practiceChallenge.model');
const { geminiProvider } = require('../dist/ai/gemini.provider');

function challengeDoc(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    technology: 'javascript',
    hints: ['h1', 'h2', 'h3'],
    hintCount: 3,
    referenceSolution: 'solution text',
    referenceSolutionFiles: [],
    starterFiles: [{ path: 'index.js', content: '// start' }],
    ...overrides,
  };
}

/** A tiny in-memory fake of the PracticeAttempt collection whose findOneAndUpdate mimics MongoDB's real
 * guarantee: single-document writes are atomic and serialized, even when the calling code "fires" two
 * requests concurrently. This is what actually proves Issue #4 is fixed — not just that the right query
 * shape is used, but that two genuinely-interleaved calls cannot double-unlock or skip a hint level. */
function makeAtomicFakeAttemptStore(doc) {
  let queue = Promise.resolve();
  return {
    async findOneAndUpdate(filter, update) {
      // Serialize onto a queue (like Mongo serializes writes to one document), but let two "concurrent"
      // JS calls actually interleave their microtasks up to this point first, so the race is real.
      const run = queue.then(async () => {
        await new Promise((r) => setTimeout(r, 1)); // force a tick so both callers' filters are evaluated against a state that could have just changed
        if (doc.hintsUsed >= filter.hintsUsed.$lt) return null; // matches the real query's condition
        doc.hintsUsed += update.$inc.hintsUsed;
        return { ...doc };
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

describe('Issue #4 — hint unlock is race-safe under real concurrent requests', () => {
  afterEach(() => jest.restoreAllMocks());

  test('two simultaneous hint requests never unlock the same level twice or skip a level', async () => {
    const userId = 'user-a';
    const attemptId = new mongoose.Types.ObjectId();
    const challenge = challengeDoc();
    const fakeDoc = { hintsUsed: 0 };
    const fakeStore = makeAtomicFakeAttemptStore(fakeDoc);

    jest.spyOn(PracticeAttempt, 'findOne').mockReturnValue({ select: () => Promise.resolve({ _id: attemptId, userId, challengeId: challenge._id, status: 'in_progress' }) });
    jest.spyOn(PracticeChallenge, 'findById').mockReturnValue({ select: () => Promise.resolve(challenge) });
    jest.spyOn(PracticeAttempt, 'findOneAndUpdate').mockImplementation((filter, update) => fakeStore.findOneAndUpdate(filter, update));

    // Fire two requests "at the same time" — both read the challenge, both race to increment.
    const [a, b] = await Promise.all([
      attemptService.requestHint(String(attemptId), userId),
      attemptService.requestHint(String(attemptId), userId),
    ]);

    const levels = [a.hintLevel, b.hintLevel].sort();
    expect(levels).toEqual([1, 2]); // one gets level 1, the other level 2 — never both level 1, never level 2 without 1
    expect([a.hint, b.hint].sort()).toEqual(['h1', 'h2']);
    expect(fakeDoc.hintsUsed).toBe(2); // exactly two increments happened, not more

    // A third concurrent pair: one should get level 3, the other must be rejected (cap enforced under race too).
    const results = await Promise.allSettled([
      attemptService.requestHint(String(attemptId), userId),
      attemptService.requestHint(String(attemptId), userId),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0].value.hintLevel).toBe(3);
    expect(fakeDoc.hintsUsed).toBe(3); // never exceeded the cap despite the race
  });
});

describe('Issue #3 — a forged browser "passed" result can never mark a challenge solved', () => {
  afterEach(() => jest.restoreAllMocks());

  test('recordRun stores the client status but never touches attempt.status, and marks it untrusted', async () => {
    const userId = 'user-a';
    const attemptId = new mongoose.Types.ObjectId();
    const attemptDoc = { _id: attemptId, userId, status: 'in_progress', challengeId: new mongoose.Types.ObjectId(), save: jest.fn().mockResolvedValue(undefined) };
    jest.spyOn(PracticeAttempt, 'findOne').mockResolvedValue(attemptDoc);
    jest.spyOn(PracticeChallenge, 'findById').mockReturnValue({ select: async () => ({ technology: 'javascript' }) });

    // A forged client payload claiming success.
    await attemptService.recordRun(String(attemptId), userId, { status: 'passed', output: 'anything the client wants' });

    expect(attemptDoc.runResult.status).toBe('passed'); // displayed to the user as an observation...
    expect(attemptDoc.runResult.trusted).toBe(false); // ...but explicitly marked untrusted
    expect(attemptDoc.status).toBe('in_progress'); // attempt.status was NEVER changed by the run
  });

  test('checkAndEvaluate ignores an untrusted runResult.output entirely — even output-match criteria fall through to AI, not the forged value', async () => {
    const userId = 'user-a';
    const attemptId = new mongoose.Types.ObjectId();
    const challenge = { title: 't', instructions: 'i', expectedBehavior: '', technology: 'javascript', topic: 'x', evaluationCriteria: { kind: 'output-match', expected: '42' } };
    const attemptDoc = {
      _id: attemptId, userId, status: 'in_progress', challengeId: new mongoose.Types.ObjectId(),
      files: [{ path: 'a.js', content: 'console.log(1)' }],
      runResult: { status: 'passed', output: '42', trusted: false, source: 'browser-sandbox' }, // forged to match "expected"
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(PracticeAttempt, 'findOne').mockResolvedValue(attemptDoc);
    jest.spyOn(PracticeChallenge, 'findById').mockReturnValue({ select: async () => challenge });
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    const generate = jest.spyOn(geminiProvider, 'generate').mockResolvedValue('{"status":"needs_work","feedback":"not actually correct"}');

    await attemptService.checkAndEvaluate(String(attemptId), userId);

    // The AI was consulted (proving the deterministic output-match branch was NOT taken from the forged output).
    expect(generate).toHaveBeenCalledTimes(1);
    expect(attemptDoc.status).not.toBe('passed');
  });

  test('a genuinely trusted run result (hypothetical future execution layer) IS allowed to feed the deterministic checker', async () => {
    const result = await checkAttempt({
      challenge: { title: 't', instructions: 'i', expectedBehavior: '', technology: 'javascript', topic: 'x', evaluationCriteria: { kind: 'output-match', expected: '42' } },
      files: [{ path: 'a.js', content: 'console.log(42)' }],
      runOutput: '42', // only reaches here at all when attemptService decided runResult.trusted === true
    });
    expect(result.status).toBe('passed');
  });
});

describe('Issue #17 — reset finalizes the old attempt and creates a real new document', () => {
  afterEach(() => jest.restoreAllMocks());

  test('reset marks the in-progress attempt abandoned (via an atomic conditional update) and creates attemptNumber+1 with starter files', async () => {
    const userId = 'user-a';
    const attemptId = new mongoose.Types.ObjectId();
    const challenge = challengeDoc();
    const oldAttempt = { _id: attemptId, userId, challengeId: challenge._id, status: 'in_progress', attemptNumber: 1, projectId: undefined };
    jest.spyOn(PracticeChallenge, 'findById').mockResolvedValue(challenge);
    const newAttempt = { _id: new mongoose.Types.ObjectId(), attemptNumber: 2, status: 'in_progress' };
    // loadOwnedAttempt() finds the old attempt; resetAttempt() then atomically flips it via findOneAndUpdate
    // (Critical Fix #3); createNextAttempt() does its own findOne(...).sort(...).select(...) for the latest
    // number, then .create(...).
    jest.spyOn(PracticeAttempt, 'findOne').mockResolvedValueOnce(oldAttempt);
    const findOneAndUpdate = jest.spyOn(PracticeAttempt, 'findOneAndUpdate').mockResolvedValue({ ...oldAttempt, status: 'abandoned' });
    jest.spyOn(PracticeAttempt, 'findOne').mockReturnValueOnce({ sort: () => ({ select: () => Promise.resolve({ attemptNumber: 1 }) }) });
    const create = jest.spyOn(PracticeAttempt, 'create').mockResolvedValue(newAttempt);

    const result = await attemptService.resetAttempt(String(attemptId), userId);

    expect(findOneAndUpdate).toHaveBeenCalledWith({ _id: attemptId, status: 'in_progress' }, { $set: { status: 'abandoned' } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ attemptNumber: 2, hintsUsed: 0, solutionRevealed: false, status: 'in_progress' }));
    expect(result).toBe(newAttempt);
  });

  test('resetting an already-passed attempt does not touch its final status, but still starts a new attempt', async () => {
    const userId = 'user-a';
    const attemptId = new mongoose.Types.ObjectId();
    const challenge = challengeDoc();
    const passedAttempt = { _id: attemptId, userId, challengeId: challenge._id, status: 'passed', attemptNumber: 1 };
    jest.spyOn(PracticeChallenge, 'findById').mockResolvedValue(challenge);
    jest.spyOn(PracticeAttempt, 'findOne')
      .mockResolvedValueOnce(passedAttempt)
      .mockReturnValueOnce({ sort: () => ({ select: () => Promise.resolve({ attemptNumber: 1 }) }) });
    const findOneAndUpdate = jest.spyOn(PracticeAttempt, 'findOneAndUpdate');
    const create = jest.spyOn(PracticeAttempt, 'create').mockResolvedValue({ _id: new mongoose.Types.ObjectId(), attemptNumber: 2 });

    await attemptService.resetAttempt(String(attemptId), userId);

    expect(findOneAndUpdate).not.toHaveBeenCalled(); // never tries to "abandon" an attempt that isn't in_progress
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ attemptNumber: 2 }));
  });
});

describe('Issue #23.9-15 — real attempt history', () => {
  afterEach(() => jest.restoreAllMocks());

  test('getAttemptHistory returns every past attempt for this user+challenge, newest first, without solution fields', async () => {
    const userId = 'user-a';
    const challengeId = new mongoose.Types.ObjectId();
    jest.spyOn(PracticeChallenge, 'findOne').mockResolvedValue({ _id: challengeId });
    const rows = [
      { attemptNumber: 2, status: 'passed', hintsUsed: 1, solutionRevealed: false, createdAt: new Date(), updatedAt: new Date() },
      { attemptNumber: 1, status: 'failed', hintsUsed: 3, solutionRevealed: true, createdAt: new Date(), updatedAt: new Date() },
    ];
    const select = jest.fn().mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => rows }) }) }) });
    jest.spyOn(PracticeAttempt, 'find').mockReturnValue({ select });

    const history = await attemptService.getAttemptHistory(String(challengeId), userId, undefined, 1);

    expect(history.attempts).toEqual(rows);
    expect(select).toHaveBeenCalledWith(expect.not.stringMatching(/referenceSolution/));
    expect(history.hasMore).toBe(false);
  });
});

describe('Issue #5/#6 — challenge generation validates AI output before saving', () => {
  afterEach(() => jest.restoreAllMocks());

  const baseGenerated = { title: 't', instructions: 'i', referenceSolution: 's', topic: 'x', starterFiles: [], referenceSolutionFiles: [] };

  test('rejects a generated challenge with fewer than 3 hints', async () => {
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    jest.spyOn(geminiProvider, 'generate').mockResolvedValue(JSON.stringify({ ...baseGenerated, hints: ['only one'] }));
    await expect(challengeService.generateChallenge({ technology: 'javascript', mode: 'practice', difficulty: 'beginner', userId: 'u1' })).rejects.toThrow('exactly 3 hints');
  });

  test('rejects a generated challenge with more than 3 hints', async () => {
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    jest.spyOn(geminiProvider, 'generate').mockResolvedValue(JSON.stringify({ ...baseGenerated, hints: ['a', 'b', 'c', 'd'] }));
    await expect(challengeService.generateChallenge({ technology: 'javascript', mode: 'practice', difficulty: 'beginner', userId: 'u1' })).rejects.toThrow('exactly 3 hints');
  });

  test('rejects a generated challenge with too many starter files', async () => {
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    const manyFiles = Array.from({ length: 20 }, (_, i) => ({ path: `f${i}.js`, content: 'x' }));
    jest.spyOn(geminiProvider, 'generate').mockResolvedValue(JSON.stringify({ ...baseGenerated, hints: ['a', 'b', 'c'], starterFiles: manyFiles }));
    await expect(challengeService.generateChallenge({ technology: 'javascript', mode: 'practice', difficulty: 'beginner', userId: 'u1' })).rejects.toThrow('too many');
  });

  test('accepts and truncates an oversized (but otherwise valid) generated challenge rather than saving a giant document', async () => {
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    const hugeInstructions = 'x'.repeat(50_000);
    jest.spyOn(geminiProvider, 'generate').mockResolvedValue(JSON.stringify({ ...baseGenerated, hints: ['a', 'b', 'c'], instructions: hugeInstructions }));
    const create = jest.spyOn(PracticeChallenge, 'create').mockImplementation(async (doc) => doc);
    const saved = await challengeService.generateChallenge({ technology: 'javascript', mode: 'practice', difficulty: 'beginner', userId: 'u1' });
    expect(saved.instructions.length).toBeLessThanOrEqual(4000);
    expect(create).toHaveBeenCalled();
  });

  test('rejects malformed (non-JSON) AI output outright', async () => {
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    jest.spyOn(geminiProvider, 'generate').mockResolvedValue('not json');
    await expect(challengeService.generateChallenge({ technology: 'javascript', mode: 'practice', difficulty: 'beginner', userId: 'u1' })).rejects.toThrow();
  });

  test('a valid generation sets hintCount to match the validated hints array', async () => {
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    jest.spyOn(geminiProvider, 'generate').mockResolvedValue(JSON.stringify({ ...baseGenerated, hints: ['a', 'b', 'c'] }));
    const create = jest.spyOn(PracticeChallenge, 'create').mockImplementation(async (doc) => doc);
    await challengeService.generateChallenge({ technology: 'javascript', mode: 'practice', difficulty: 'beginner', userId: 'u1' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ hintCount: 3, hints: ['a', 'b', 'c'] }));
  });
});

describe('Issue #11 — interview session count only includes completed sessions', () => {
  afterEach(() => jest.restoreAllMocks());

  test('progress totals.interviewSessions counts only status="completed"', async () => {
    const progressService = require('../dist/practice/progressService');
    jest.spyOn(PracticeAttempt, 'aggregate').mockResolvedValue([{ byTechnology: [], byTopic: [], totals: [] }]);
    jest.spyOn(PracticeAttempt, 'find').mockReturnValue({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) });
    const { InterviewSession } = require('../dist/models/interviewSession.model');
    const countDocuments = jest.spyOn(InterviewSession, 'countDocuments').mockResolvedValue(2);

    const summary = await progressService.getProgressSummary('user-a');

    expect(countDocuments).toHaveBeenCalledWith({ userId: 'user-a', status: 'completed' });
    expect(summary.totals.interviewSessions).toBe(2);
  });
});
