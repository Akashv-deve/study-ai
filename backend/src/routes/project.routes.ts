import { Router } from 'express';
import { createProject, listProjects, getProject, deleteProject, renameProject, uploadZip, getJobStatus, retryJob } from '../controllers/project.controller';
import { uploadLimiter } from '../middleware/rateLimiter';
import { upload } from '../middleware/upload';

const router = Router();

router.post('/', createProject);
router.get('/', listProjects);
router.get('/jobs/:jobId', getJobStatus);
router.post('/jobs/:jobId/retry', retryJob);
router.get('/:id', getProject);
router.patch('/:id', renameProject);
router.delete('/:id', deleteProject);
router.post('/upload', uploadLimiter, upload.single('file'), uploadZip);

export default router;
