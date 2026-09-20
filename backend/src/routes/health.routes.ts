import { Router } from 'express';
import { getDatabaseHealth } from '../config/database';
import { geminiProvider } from '../ai/gemini.provider';

const router = Router();

router.get('/health', (req, res) => {
  const dbHealth = getDatabaseHealth();
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealth.status,
      ai: geminiProvider.isAvailable() ? 'configured' : 'not_configured',
    },
  });
});

export default router;
