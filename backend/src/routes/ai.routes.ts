import { Router } from 'express';
import { generateAI } from '../controllers/ai.controller';
import { aiLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/generate', aiLimiter, generateAI);

export default router;
