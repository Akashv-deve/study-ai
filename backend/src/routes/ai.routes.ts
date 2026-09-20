import { Router } from 'express';
import { deleteFavorite, deleteGeneration, favoriteGeneration, generateAI, generateProjectOverview, getGeneration, getLatestGeneration, getProjectOverview, listFavorites, regenerateGeneration, unfavoriteGeneration } from '../controllers/ai.controller';
import { aiLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/generate', aiLimiter, generateAI);
router.get('/projects/:projectId/latest', getLatestGeneration);
router.get('/projects/:projectId/overview', getProjectOverview);
router.post('/projects/:projectId/overview', aiLimiter, generateProjectOverview);
router.get('/favorites', listFavorites);
router.delete('/favorites/:id', deleteFavorite);
router.get('/generations/:id', getGeneration);
router.delete('/generations/:id', deleteGeneration);
router.post('/generations/:id/regenerate', aiLimiter, regenerateGeneration);
router.post('/generations/:id/favorite', favoriteGeneration);
router.delete('/generations/:id/favorite', unfavoriteGeneration);

export default router;
