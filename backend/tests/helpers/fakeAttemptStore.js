const mongoose = require('mongoose');

/**
 * Mimics just enough of MongoDB's real behavior to make the concurrency tests meaningful rather than
 * tautological:
 *  - `create()` checks BOTH unique constraints (attemptNumber per user+challenge, and the partial
 *    "one in_progress per user+challenge" index) and throws a realistic E11000 error — with the same
 *    `keyPattern` shape the real driver provides — when violated, exactly like a real unique index would.
 *  - Every operation is queued onto a single promise chain with an artificial tick before it runs, so that
 *    two "concurrent" calls from Promise.all genuinely interleave their reads before either write lands —
 *    this is what makes the test a real race rather than two sequential calls that happen to be awaited
 *    together. The write itself is still applied atomically, one at a time, exactly as MongoDB guarantees
 *    for single-document operations.
 */
function makeFakeAttemptStore() {
  const docs = [];
  let seq = 0;
  let queue = Promise.resolve();
  const serialize = (fn) => {
    const run = queue.then(async () => { await new Promise((r) => setTimeout(r, 1)); return fn(); });
    queue = run.catch(() => undefined);
    return run;
  };
  const matches = (doc, filter) => Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === 'object' && '$lt' in v) return doc[k] < v.$lt;
    if (v && typeof v === 'object' && '$ne' in v) return doc[k] !== v.$ne;
    return String(doc[k]) === String(v);
  });

  return {
    _docs: docs,
    async create(input) {
      return serialize(() => {
        const attemptNumberClash = docs.some((d) => d.userId === input.userId && String(d.challengeId) === String(input.challengeId) && d.attemptNumber === input.attemptNumber);
        if (attemptNumberClash) {
          const err = new Error('E11000 duplicate key error collection: test.practiceattempts index: userId_1_challengeId_1_attemptNumber_1 dup key');
          err.code = 11000; err.keyPattern = { userId: 1, challengeId: 1, attemptNumber: 1 };
          throw err;
        }
        if (input.status === 'in_progress') {
          const activeClash = docs.some((d) => d.userId === input.userId && String(d.challengeId) === String(input.challengeId) && d.status === 'in_progress');
          if (activeClash) {
            const err = new Error('E11000 duplicate key error collection: test.practiceattempts index: one_active_attempt_per_challenge dup key');
            err.code = 11000; err.keyPattern = { userId: 1, challengeId: 1 };
            throw err;
          }
        }
        const doc = { _id: new mongoose.Types.ObjectId(), updatedAt: new Date(), ...input, seq: seq++ };
        docs.push(doc);
        return doc;
      });
    },
    findOne(filter) {
      const self = this;
      const chain = {
        sort: () => chain,
        select: () => chain,
        then: (resolve, reject) => serialize(() => {
          const found = docs.filter((d) => matches(d, filter)).sort((a, b) => b.attemptNumber - a.attemptNumber || b.seq - a.seq);
          return found[0] ?? null;
        }).then(resolve, reject),
      };
      return chain;
    },
    async findOneAndUpdate(filter, update) {
      return serialize(() => {
        const doc = docs.find((d) => matches(d, filter));
        if (!doc) return null;
        if (update.$set) Object.assign(doc, update.$set);
        if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] ?? 0) + v;
        doc.updatedAt = new Date();
        return { ...doc };
      });
    },
  };
}

module.exports = { makeFakeAttemptStore };
