const mongoose = require('mongoose');
const interviewService = require('../dist/practice/interviewService');
const { InterviewSession } = require('../dist/models/interviewSession.model');
const { geminiProvider } = require('../dist/ai/gemini.provider');


function thenableFindOne(doc) {
  return { then: (resolve) => resolve(doc), select: () => Promise.resolve(doc) };
}

describe('Small Issue #17 — a Gemini failure before the first question never leaves a broken active session', () => {
  afterEach(() => jest.restoreAllMocks());

  test('startInterview creates NOTHING if the first question fails to generate', async () => {
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    jest.spyOn(geminiProvider, 'generate').mockResolvedValue('not json'); // malformed on every attempt
    const create = jest.spyOn(InterviewSession, 'create');

    await expect(interviewService.startInterview('user-a', { technology: 'javascript' })).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  test('startInterview succeeds and creates exactly one session once a valid question is generated', async () => {
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    jest.spyOn(geminiProvider, 'generate').mockResolvedValue(JSON.stringify({ category: 'coding', question: 'Explain closures.' }));
    const created = { _id: new mongoose.Types.ObjectId() };
    const create = jest.spyOn(InterviewSession, 'create').mockResolvedValue(created);

    const session = await interviewService.startInterview('user-a', { technology: 'javascript' });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ turns: [expect.objectContaining({ question: 'Explain closures.', category: 'coding' })] }));
    expect(session).toBe(created);
  });
});

describe('Small Issue #18 — malformed AI JSON never fabricates content', () => {
  afterEach(() => jest.restoreAllMocks());

  test('a malformed question response is retried once before giving up (never falls back to a generic canned question)', async () => {
    jest.spyOn(geminiProvider, 'isAvailable').mockReturnValue(true);
    const generate = jest.spyOn(geminiProvider, 'generate')
      .mockResolvedValueOnce('garbage')
      .mockResolvedValueOnce(JSON.stringify({ category: 'fundamentals', question: 'Real question after retry' }));

    jest.spyOn(InterviewSession, 'create').mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    await interviewService.startInterview('user-a', { technology: 'javascript' });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  test('a malformed report response leaves the session ACTIVE (not falsely completed) and preserves every real answer', async () => {
    const sessionDoc = {
      _id: new mongoose.Types.ObjectId(), userId: 'user-a', status: 'active', processing: false,
      turns: [{ category: 'coding', question: 'Q1', answer: 'my real answer', followUps: [] }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(InterviewSession, 'findOneAndUpdate').mockResolvedValue(sessionDoc); // claimProcessing succeeds
    jest.spyOn(InterviewSession, 'updateOne').mockResolvedValue({});
    jest.spyOn(geminiProvider, 'generate').mockResolvedValue('not valid json at all');

    await expect(interviewService.endInterview(String(sessionDoc._id), 'user-a')).rejects.toThrow('try ending the interview again');

    expect(sessionDoc.status).toBe('active'); // never flipped to completed
    expect(sessionDoc.report).toBeUndefined(); // no fabricated report
    expect(sessionDoc.turns[0].answer).toBe('my real answer'); // the real answer is untouched
  });
});

describe('Small Issue #19 — concurrent submitAnswer cannot duplicate a follow-up', () => {
  afterEach(() => jest.restoreAllMocks());

  test('two simultaneous submitAnswer calls on the same session: only one proceeds, the other is atomically refused', async () => {
    const sessionId = new mongoose.Types.ObjectId();
    const sessionDoc = {
      _id: sessionId, userId: 'user-a', status: 'active', processing: false, technology: 'javascript',
      turns: [{ category: 'coding', question: 'Q1', followUps: [] }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    // Simulate the atomic mutex: first findOneAndUpdate call "wins" (returns the doc), second "loses" (returns null).
    let claimed = false;
    jest.spyOn(InterviewSession, 'findOneAndUpdate').mockImplementation(async (filter) => {
      if (filter.processing && filter.processing.$ne === true && !claimed) { claimed = true; return sessionDoc; }
      return null;
    });
    jest.spyOn(InterviewSession, 'findOne').mockReturnValue(thenableFindOne(sessionDoc)); // used by claimProcessing's failure-diagnosis path
    jest.spyOn(InterviewSession, 'updateOne').mockImplementation(async () => { claimed = false; return {}; });
    jest.spyOn(geminiProvider, 'generate').mockResolvedValue(JSON.stringify({ question: 'A follow-up' }));

    const results = await Promise.allSettled([
      interviewService.submitAnswer(String(sessionId), 'user-a', 'first answer'),
      interviewService.submitAnswer(String(sessionId), 'user-a', 'duplicate click'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toMatch(/already been answered|still being processed/);
    expect(sessionDoc.turns[0].followUps).toHaveLength(1); // never duplicated
  });
});

describe('Small Issue #20 — a follow-up generation failure never loses the candidate\'s answer', () => {
  afterEach(() => jest.restoreAllMocks());

  test('the answer is saved even when the subsequent Gemini follow-up call throws', async () => {
    const sessionId = new mongoose.Types.ObjectId();
    const sessionDoc = {
      _id: sessionId, userId: 'user-a', status: 'active', processing: true, technology: 'javascript',
      turns: [{ category: 'coding', question: 'Q1', followUps: [] }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(InterviewSession, 'findOneAndUpdate').mockResolvedValue(sessionDoc);
    jest.spyOn(InterviewSession, 'updateOne').mockResolvedValue({});
    jest.spyOn(geminiProvider, 'generate').mockRejectedValue(new Error('upstream Gemini failure'));

    // The follow-up attempt fails and is swallowed; the fallback next-question generation also fails here
    // (generate() always rejects) and that failure legitimately propagates — but only AFTER the answer was
    // already durably saved, which is the actual guarantee Issue #20 asks for.
    await expect(interviewService.submitAnswer(String(sessionId), 'user-a', 'the real answer')).rejects.toThrow();

    expect(sessionDoc.turns[0].answer).toBe('the real answer'); // preserved despite the downstream failure
    expect(sessionDoc.status).toBe('active'); // not bricked, not falsely completed
    expect(sessionDoc.save).toHaveBeenCalled(); // the save carrying the answer actually happened
  });
});

describe('Small Issue #21 / #37 — session lifecycle and ownership', () => {
  afterEach(() => jest.restoreAllMocks());

  test('a completed session cannot receive another answer', async () => {
    const sessionId = new mongoose.Types.ObjectId();
    jest.spyOn(InterviewSession, 'findOneAndUpdate').mockResolvedValue(null); // filter requires status:'active', so a completed session never matches
    jest.spyOn(InterviewSession, 'findOne').mockReturnValue(thenableFindOne({ _id: sessionId, userId: 'user-a', status: 'completed' }));

    await expect(interviewService.submitAnswer(String(sessionId), 'user-a', 'too late')).rejects.toThrow('already ended');
  });

  test('a user cannot access another user\'s interview session', async () => {
    jest.spyOn(InterviewSession, 'findOne').mockReturnValue(thenableFindOne(null)); // the real {_id, userId} filter simply finds nothing for the wrong user
    await expect(interviewService.getInterview(String(new mongoose.Types.ObjectId()), 'attacker')).rejects.toThrow('not found');
  });
});
