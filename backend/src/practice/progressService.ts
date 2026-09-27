import { PracticeAttempt } from '../models/practiceAttempt.model';
import { PracticeChallenge } from '../models/practiceChallenge.model';
import { InterviewSession } from '../models/interviewSession.model';

export interface TechnologyProgress {
  technology: string;
  attempted: number; // UNIQUE challenges attempted for this technology
  solved: number; // UNIQUE challenges solved for this technology
  totalAttempts: number; // real PracticeAttempt documents, retries included
  hintsUsed: number;
  solutionsRevealed: number;
}

export interface ProgressSummary {
  byTechnology: TechnologyProgress[];
  byTopic: { topic: string; attempted: number; solved: number }[];
  totals: { challengesAttempted: number; challengesSolved: number; totalAttempts: number; hintsUsed: number; solutionsRevealed: number; interviewSessions: number };
  weakTopics: string[]; // topics with attempts but a solve rate below 50%, evidence-based, never guessed
  recentActivity: { challengeId: string; attemptId: string; attemptNumber: number; title: string; technology: string; status: string; assistedSolve?: boolean; updatedAt: Date }[];
}

interface FacetTechRow { technology: string; attempted: number; solved: number; totalAttempts: number; hintsUsed: number; solutionsRevealed: number }
interface FacetTopicRow { topic: string; attempted: number; solved: number }
interface FacetTotalsRow { challengesAttempted: number; challengesSolved: number; totalAttempts: number; hintsUsed: number; solutionsRevealed: number }

/** Everything here is computed by MongoDB aggregation, not by loading every PracticeAttempt into application
 * memory (Small Issue #13) — a single round trip does the per-challenge rollup (so "3 retries on 1 challenge"
 * correctly becomes challengesAttempted=1, totalAttempts=3 — Small Issue #14) and then fans out into the
 * technology/topic/totals breakdowns via $facet, sharing that rollup instead of recomputing it three times. */
export async function getProgressSummary(userId: string): Promise<ProgressSummary> {
  const [facets] = await PracticeAttempt.aggregate<{ byTechnology: FacetTechRow[]; byTopic: FacetTopicRow[]; totals: FacetTotalsRow[] }>([
    { $match: { userId } },
    { $lookup: { from: PracticeChallenge.collection.name, localField: 'challengeId', foreignField: '_id', as: 'challenge' } },
    { $unwind: '$challenge' }, // drops attempts whose challenge no longer exists — nothing real to attribute them to
    {
      $group: {
        _id: '$challengeId',
        technology: { $first: '$challenge.technology' },
        topic: { $first: '$challenge.topic' },
        attemptCount: { $sum: 1 },
        hintsUsed: { $sum: '$hintsUsed' },
        solutionsRevealed: { $sum: { $cond: ['$solutionRevealed', 1, 0] } },
        solved: { $max: { $cond: [{ $eq: ['$status', 'passed'] }, 1, 0] } },
      },
    },
    {
      $facet: {
        byTechnology: [
          { $group: { _id: '$technology', attempted: { $sum: 1 }, solved: { $sum: '$solved' }, totalAttempts: { $sum: '$attemptCount' }, hintsUsed: { $sum: '$hintsUsed' }, solutionsRevealed: { $sum: '$solutionsRevealed' } } },
          { $project: { _id: 0, technology: '$_id', attempted: 1, solved: 1, totalAttempts: 1, hintsUsed: 1, solutionsRevealed: 1 } },
        ],
        byTopic: [
          { $group: { _id: '$topic', attempted: { $sum: 1 }, solved: { $sum: '$solved' } } },
          { $project: { _id: 0, topic: '$_id', attempted: 1, solved: 1 } },
        ],
        totals: [
          { $group: { _id: null, challengesAttempted: { $sum: 1 }, challengesSolved: { $sum: '$solved' }, totalAttempts: { $sum: '$attemptCount' }, hintsUsed: { $sum: '$hintsUsed' }, solutionsRevealed: { $sum: '$solutionsRevealed' } } },
          { $project: { _id: 0 } },
        ],
      },
    },
  ]);

  const byTechnology = facets?.byTechnology ?? [];
  const byTopic = facets?.byTopic ?? [];
  const totalsRow = facets?.totals?.[0] ?? { challengesAttempted: 0, challengesSolved: 0, totalAttempts: 0, hintsUsed: 0, solutionsRevealed: 0 };
  const weakTopics = byTopic.filter((t) => t.attempted >= 2 && t.solved / t.attempted < 0.5).map((t) => t.topic);

  // Only count interviews that actually finished with a report — an active or abandoned session is not a completed session.
  const interviewSessions = await InterviewSession.countDocuments({ userId, status: 'completed' });

  // recentActivity stays a small, bounded query regardless of how large the user's total history grows.
  const recentRows = await PracticeAttempt.find({ userId }).select('challengeId attemptNumber status assistedSolve updatedAt').sort({ updatedAt: -1 }).limit(10).lean();
  const recentChallengeIds = [...new Set(recentRows.map((r) => String(r.challengeId)))];
  const recentChallenges = recentChallengeIds.length > 0 ? await PracticeChallenge.find({ _id: { $in: recentChallengeIds } }).select('title technology').lean() : [];
  const challengeById = new Map(recentChallenges.map((c) => [String(c._id), c]));
  const recentActivity = recentRows.map((a) => {
    const c = challengeById.get(String(a.challengeId));
    return { challengeId: String(a.challengeId), attemptId: String(a._id), attemptNumber: a.attemptNumber, title: c?.title ?? 'Deleted challenge', technology: c?.technology ?? 'unknown', status: a.status, assistedSolve: a.assistedSolve, updatedAt: a.updatedAt };
  });

  return {
    byTechnology,
    byTopic,
    totals: { ...totalsRow, interviewSessions },
    weakTopics,
    recentActivity,
  };
}
