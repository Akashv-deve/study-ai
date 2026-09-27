import { PracticeAttempt } from '../models/practiceAttempt.model';

/**
 * Critical Fix #4: the new partial unique index on {userId, challengeId} (filtered to status: 'in_progress')
 * cannot be BUILT if the collection already contains a violation — MongoDB refuses to create a unique index
 * over data that doesn't satisfy it. This must run, and succeed, before PracticeAttempt.syncIndexes() is
 * called. It is idempotent and safe to run on every boot (a healthy database is a single aggregation query
 * that finds nothing to do).
 *
 * Resolution policy: for any (userId, challengeId) with more than one in_progress attempt, the most
 * recently updated one is kept active; every older one is marked 'abandoned' — never deleted, so history
 * stays intact and truthful (these were real, if orphaned, attempts).
 */
export async function migratePracticeAttempts(): Promise<{ duplicateGroups: number; abandoned: number }> {
  const duplicateGroups = await PracticeAttempt.aggregate([
    { $match: { status: 'in_progress' } },
    { $group: { _id: { userId: '$userId', challengeId: '$challengeId' }, count: { $sum: 1 }, ids: { $push: { id: '$_id', updatedAt: '$updatedAt' } } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  let abandoned = 0;
  for (const group of duplicateGroups) {
    const sorted = [...group.ids].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const [, ...staleOnes] = sorted; // keep the newest; abandon the rest
    if (staleOnes.length === 0) continue;
    const result = await PracticeAttempt.updateMany(
      { _id: { $in: staleOnes.map((s) => s.id) }, status: 'in_progress' },
      { $set: { status: 'abandoned' } },
    );
    abandoned += result.modifiedCount ?? 0;
  }

  if (duplicateGroups.length > 0) {
    console.warn(`[practice migration] resolved ${duplicateGroups.length} duplicate in_progress attempt group(s), abandoned ${abandoned} stale attempt(s)`);
  }

  // Build indexes explicitly now that the collection is known to satisfy the partial unique constraint.
  // Never silently ignored: a real failure here means the invariant this whole fix exists to guarantee is
  // NOT enforced, so it is logged loudly (and rethrown — see index.ts, which treats this the same as any
  // other startup DB failure and runs in a degraded state rather than pretending it succeeded).
  try {
    await PracticeAttempt.syncIndexes();
  } catch (err) {
    console.error('[practice migration] FAILED to build PracticeAttempt indexes after migration — the one-active-attempt invariant is NOT enforced at the database level:', err);
    throw err;
  }

  return { duplicateGroups: duplicateGroups.length, abandoned };
}
