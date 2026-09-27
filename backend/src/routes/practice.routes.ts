import { Router } from 'express';
import { aiLimiter } from '../middleware/rateLimiter';
import {
  listChallenges, getChallenge, generateChallenge,
  getOrCreateAttempt, getAttemptHistory, saveAttempt, resetAttempt, runAttempt, checkAttempt,
  requestHint, revealSolution, explainMistake, getAttempt,
  getProgress, getProjectContext,
} from '../controllers/practice.controller';

const router = Router();

router.get('/challenges', listChallenges);
router.get('/challenges/:id', getChallenge);
router.post('/challenges/generate', aiLimiter, generateChallenge);

router.get('/challenges/:challengeId/attempt', getOrCreateAttempt);
router.get('/challenges/:challengeId/attempts', getAttemptHistory);
router.patch('/attempts/:id', saveAttempt);
router.post('/attempts/:id/reset', resetAttempt);
router.post('/attempts/:id/run', runAttempt);
router.post('/attempts/:id/check', aiLimiter, checkAttempt);
router.post('/attempts/:id/hint', requestHint);
router.post('/attempts/:id/reveal', revealSolution);
router.post('/attempts/:id/explain-mistake', aiLimiter, explainMistake);
router.get('/attempts/:id', getAttempt);

router.get('/progress', getProgress);
router.get('/projects/:projectId/context', getProjectContext);

export default router;
