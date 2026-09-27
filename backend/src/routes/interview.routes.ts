import { Router } from 'express';
import { aiLimiter } from '../middleware/rateLimiter';
import { startInterview, submitAnswer, endInterview, getInterview, listInterviews } from '../controllers/interview.controller';

const router = Router();

router.get('/', listInterviews);
router.post('/', aiLimiter, startInterview);
router.get('/:id', getInterview);
router.post('/:id/answer', aiLimiter, submitAnswer);
router.post('/:id/end', aiLimiter, endInterview);

export default router;
