import { Router } from 'express';
import { getFileTree, getFileContent } from '../controllers/file.controller';

const router = Router();

router.get('/projects/:projectId/files', getFileTree);
router.get('/projects/:projectId/files/:fileId/content', getFileContent);

export default router;
