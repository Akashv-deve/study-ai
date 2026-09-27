const mongoose = require('mongoose');
const { migratePracticeAttempts } = require('../dist/practice/migrations');
const { PracticeAttempt } = require('../dist/models/practiceAttempt.model');

describe('Critical Fix #4 — migration resolves pre-existing duplicate active attempts before the index is built', () => {
  afterEach(() => jest.restoreAllMocks());

  test('keeps the newest in_progress attempt per user+challenge and abandons the rest, then builds indexes', async () => {
    const userId = 'user-a';
    const challengeId = new mongoose.Types.ObjectId();
    const older = { id: new mongoose.Types.ObjectId(), updatedAt: new Date('2026-01-01') };
    const newer = { id: new mongoose.Types.ObjectId(), updatedAt: new Date('2026-02-01') };
    const oldest = { id: new mongoose.Types.ObjectId(), updatedAt: new Date('2025-12-01') };

    jest.spyOn(PracticeAttempt, 'aggregate').mockResolvedValue([
      { _id: { userId, challengeId }, count: 3, ids: [older, newer, oldest] },
    ]);
    const updateMany = jest.spyOn(PracticeAttempt, 'updateMany').mockResolvedValue({ modifiedCount: 2 });
    const syncIndexes = jest.spyOn(PracticeAttempt, 'syncIndexes').mockResolvedValue([]);

    const result = await migratePracticeAttempts();

    // Only the two OLDER ones (older, oldest) are abandoned — newer survives as the active attempt.
    expect(updateMany).toHaveBeenCalledWith(
      { _id: { $in: expect.arrayContaining([older.id, oldest.id]) }, status: 'in_progress' },
      { $set: { status: 'abandoned' } },
    );
    const abandonedIds = updateMany.mock.calls[0][0]._id.$in.map(String);
    expect(abandonedIds).not.toContain(String(newer.id)); // the newest is never touched
    expect(abandonedIds).toHaveLength(2);
    expect(result).toEqual({ duplicateGroups: 1, abandoned: 2 });
    expect(syncIndexes).toHaveBeenCalled(); // indexes are built AFTER the cleanup, not before
  });

  test('a healthy database (no duplicates) does nothing but still builds indexes', async () => {
    jest.spyOn(PracticeAttempt, 'aggregate').mockResolvedValue([]);
    const updateMany = jest.spyOn(PracticeAttempt, 'updateMany');
    const syncIndexes = jest.spyOn(PracticeAttempt, 'syncIndexes').mockResolvedValue([]);

    const result = await migratePracticeAttempts();

    expect(updateMany).not.toHaveBeenCalled();
    expect(syncIndexes).toHaveBeenCalled();
    expect(result).toEqual({ duplicateGroups: 0, abandoned: 0 });
  });

  test('an index build failure is never silently swallowed — it propagates so the app knows the invariant is not enforced', async () => {
    jest.spyOn(PracticeAttempt, 'aggregate').mockResolvedValue([]);
    jest.spyOn(PracticeAttempt, 'syncIndexes').mockRejectedValue(new Error('index build failed'));
    await expect(migratePracticeAttempts()).rejects.toThrow('index build failed');
  });
});
